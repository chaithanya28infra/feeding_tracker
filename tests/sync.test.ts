import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, type State, type Diaper } from "../lib/model";
import { snapshot, reconcile, same } from "../lib/sync-model";
import {
  loadState,
  saveState,
  loadSync,
  connectSync,
  commitSync,
  pauseSync,
  resumeSync,
} from "../lib/storage";
import { syncOnce, type SyncTransport } from "../lib/sync-engine";
const user = "parent-a",
  baby = "baby-a";
const event = (id: string, notes = ""): Diaper => ({
  id,
  kind: "diaper",
  type: "wet",
  start: 1000,
  notes,
});
const a = "894b72b3-532a-45c1-9fa6-91ed57f734dd",
  b = "776b795d-2078-4d75-ae34-1e0b2b9a9870";
const state = (events: Diaper[] = []): State => ({
  ...initialState,
  baby: { ...initialState.baby, name: "Baby", dob: "2026-01-01" },
  events,
});
test("three-way merge combines different IDs and propagates deletion", () => {
  const base = snapshot(state([event(a)])),
    local = snapshot(state([event(a), event(b)])),
    remote = snapshot(state());
  const m = reconcile(base, local, remote);
  assert.equal(m.conflicts.length, 0);
  assert.deepEqual(
    m.value.events.map((e) => e.id),
    [b],
  );
});
test("concurrent edit/delete conflicts pause instead of losing an edit", () => {
  const base = snapshot(state([event(a)])),
    local = snapshot(state([event(a, "edited")])),
    remote = snapshot(state());
  assert.deepEqual(reconcile(base, local, remote).conflicts, ["event:" + a]);
  assert.equal(
    reconcile(base, local, remote, "local").value.events[0].notes,
    "edited",
  );
  assert.equal(reconcile(base, local, remote, "remote").value.events.length, 0);
});
test("identical retries do not duplicate an event", () => {
  const base = snapshot(state()),
    next = snapshot(state([event(a)]));
  assert.equal(reconcile(base, next, next).value.events.length, 1);
  assert.ok(same(next, { events: next.events, baby: next.baby }));
});
test("different baby details conflict by field", () => {
  const base = snapshot(state()),
    local = snapshot(state()),
    remote = snapshot(state());
  local.baby = { ...local.baby, name: "Local" };
  remote.baby = { ...remote.baby, name: "Remote" };
  assert.deepEqual(reconcile(base, local, remote).conflicts, ["baby.name"]);
});
test("durable queue, offline retry, account boundary and edits during upload", async () => {
  const base = state();
  await saveState(base);
  await connectSync(user, baby, snapshot(base), 1);
  await saveState(state([event(a)]));
  assert.equal((await loadSync())?.pending?.events.length, 1);
  let writes = 0,
    cloud = snapshot(base),
    revision = 1;
  const transport: SyncTransport = {
    userId: async () => user,
    read: async () => ({
      snapshot: { ...cloud, timer: null, dark: false },
      revision,
    }),
    write: async (_id, next, expected) => {
      writes++;
      assert.equal(expected, revision);
      cloud = next;
      revision++;
      return { snapshot: { ...cloud, timer: null, dark: false }, revision };
    },
  };
  await assert.rejects(() =>
    syncOnce({
      ...transport,
      read: async () => {
        throw Error("offline");
      },
    }),
  );
  assert.ok((await loadSync())?.pending);
  assert.equal(
    await syncOnce({ ...transport, userId: async () => "another-parent" }),
    "signed-out",
  );
  assert.equal(writes, 0);
  assert.equal(await syncOnce(transport), "synced");
  assert.equal(writes, 1);
  assert.equal((await loadSync())?.pending, null);
  await syncOnce(transport);
  assert.equal(writes, 1);
  const observed = snapshot(await loadState());
  await saveState(state([event(a), event(b)]));
  await commitSync((await loadSync())!, observed, cloud, revision);
  assert.equal((await loadState()).events.length, 2);
  assert.ok((await loadSync())?.pending);
  await pauseSync();
  await saveState(state([event(a), event(b, "offline edit")]));
  assert.equal(await syncOnce(transport), "paused");
  assert.ok((await loadSync())?.pending);
  await resumeSync(user);
  assert.equal(await syncOnce(transport), "synced");
  assert.equal(cloud.events.length, 2);
  await assert.rejects(
    () => connectSync("another-parent", "another-baby", snapshot(base), 1),
    /already linked/,
  );
});

test("retry after lost upload acknowledgement is idempotent", async () => {
  const base = state();
  await saveState(base);
  await connectSync(user, baby, snapshot(base), 1);
  await saveState(state([event(a)]));
  let cloud = snapshot(base),
    revision = 1,
    writes = 0;
  const transport: SyncTransport = {
    userId: async () => user,
    read: async () => ({ snapshot: cloud, revision }),
    write: async (_id, next, expected) => {
      assert.equal(expected, revision);
      cloud = next;
      revision++;
      writes++;
      throw Error("connection lost after commit");
    },
  };
  await assert.rejects(() => syncOnce(transport), /connection lost/);
  assert.ok((await loadSync())?.pending);
  assert.equal(await syncOnce(transport), "synced");
  assert.equal(writes, 1);
  assert.equal((await loadState()).events.length, 1);
  assert.equal((await loadSync())?.pending, null);
});
test("cloud refresh preserves the device active timer", async () => {
  const local = await loadState(),
    observed = snapshot(local),
    binding = (await loadSync())!;
  local.timer = {
    id: "active-device-timer",
    start: 1000,
    side: "right",
    segments: [{ side: "right", start: 1000, end: null }],
    paused: false,
  };
  await saveState(local);
  const remote = snapshot({ ...local, events: [...local.events, event(b)] });
  await commitSync(binding, observed, remote, binding.revision + 1);
  assert.equal((await loadState()).timer?.id, "active-device-timer");
  assert.equal((await loadState()).events.length, 2);
});
