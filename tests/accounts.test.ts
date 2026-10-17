import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activateAccount,
  startFreshAccount,
  clearAccountData,
  lockStorage,
  loadState,
  saveState,
  loadSync,
  connectSync,
  getStorageUser,
} from "../lib/storage";
import { initialState } from "../lib/model";
import { snapshot } from "../lib/sync-model";
import { syncOnce } from "../lib/sync-engine";

test("account storage preserves legacy logs, separates accounts, and blocks signed-out access", async () => {
  const legacy = structuredClone(initialState);
  legacy.baby.dob = "2026-01-01";
  legacy.events = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "diaper",
      start: 1000,
      type: "wet",
      notes: "private",
    },
  ];
  await saveState(legacy);
  lockStorage();
  await assert.rejects(loadState, /Sign in/);
  await assert.rejects(() => saveState(legacy), /Sign in/);
  assert.equal(
    await activateAccount("parent-a"),
    false,
    "unclaimed logs require explicit consent",
  );
  await startFreshAccount("parent-b");
  assert.equal((await loadState()).events.length, 0);
  lockStorage();
  assert.equal(await activateAccount("parent-a", true), true);
  assert.equal(
    (await loadState()).events[0].id,
    "11111111-1111-4111-8111-111111111111",
  );
  const remote = snapshot(legacy);
  await connectSync("parent-a", "baby-a", remote, 1);
  lockStorage();
  await activateAccount("parent-b");
  assert.equal(await loadSync(), null, "sync queues are also account-specific");
  assert.equal((await loadState()).events.length, 0);
  const other = structuredClone(initialState);
  other.events = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "diaper",
      start: 2000,
      type: "dirty",
      notes: "",
    },
  ];
  await saveState(other);
  await activateAccount("parent-a");
  assert.equal(
    (await loadState()).events[0].id,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal((await loadSync())?.userId, "parent-a");

  let writes = 0;
  await syncOnce({
    userId: async () => "parent-a",
    read: async () => {
      await activateAccount("parent-b");
      return { snapshot: remote, revision: 2 };
    },
    write: async () => {
      writes++;
      throw Error("Must not upload after account switch");
    },
  });
  assert.equal(writes, 0);
  assert.equal(
    (await loadState()).events[0].id,
    "22222222-2222-4222-8222-222222222222",
  );
  await clearAccountData("parent-a");
  await activateAccount("parent-a");
  assert.equal(
    (await loadState()).events.length,
    0,
    "cleared logs do not reappear from legacy storage",
  );
  assert.equal(await loadSync(), null);
  await activateAccount("parent-b");
  assert.equal(
    (await loadState()).events[0].id,
    "22222222-2222-4222-8222-222222222222",
    "clearing one account preserves the other",
  );
  lockStorage();
  assert.equal(await activateAccount("parent-a", false, () => false), false);
  assert.equal(
    getStorageUser(),
    null,
    "cancelled account loading cannot unlock signed-out storage",
  );
});
