import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBackup, mergeBackup } from "../lib/cloud-validation";
import { initialState, type State } from "../lib/model";
import { GET, POST } from "../app/api/cloud/route";
const id = "894b72b3-532a-45c1-9fa6-91ed57f734dd";
function state(): State {
  return {
    ...initialState,
    baby: { ...initialState.baby, name: "Test baby", dob: "2026-01-01" },
    events: [{ id, kind: "diaper", start: 1000, type: "both", notes: "test" }],
  };
}
test("backups exclude active timers without mutating device state", () => {
  const local = state();
  local.timer = {
    id: "active",
    start: 1000,
    side: "left",
    segments: [{ side: "left", start: 1000, end: null }],
    paused: false,
  };
  assert.equal(validateBackup(local).timer, null);
  assert.ok(local.timer);
});
test("backup rejects malformed dates and duplicate event IDs", () => {
  const badDate = state();
  badDate.baby.dob = "2026-02-31";
  assert.throws(() => validateBackup(badDate));
  const duplicate = state();
  duplicate.events.push(duplicate.events[0]);
  assert.throws(() => validateBackup(duplicate), /unique UUIDs/);
});
test("backup rejects negative feeding durations and invalid timezones", () => {
  const s = state();
  s.events = [
    {
      id,
      kind: "feed",
      start: 1000,
      end: 2000,
      left: -1,
      right: 0,
      lastSide: "left",
      notes: "",
    },
  ];
  assert.throws(() => validateBackup(s), /duration/);
  s.events = [];
  s.baby.timezone = "not-a-zone";
  assert.throws(() => validateBackup(s), /timezone/);
});
test("restore merges IDs and preserves newer device entries and theme", () => {
  const local = state(),
    remote = state();
  local.events[0].notes = "local edit";
  remote.events.push({
    id: "776b795d-2078-4d75-ae34-1e0b2b9a9870",
    kind: "diaper",
    start: 2000,
    type: "wet",
    notes: "remote",
  });
  local.dark = true;
  const merged = mergeBackup(local, remote);
  assert.equal(merged.events.length, 2);
  assert.equal(merged.events.find((e) => e.id === id)?.notes, "local edit");
  assert.equal(merged.dark, true);
});
test("restore refuses to replace an active feeding", () => {
  const local = state();
  local.timer = {
    id: "active",
    start: 1000,
    side: "left",
    segments: [],
    paused: true,
  };
  assert.throws(() => mergeBackup(local, state()), /active feeding/);
});
test("server rejects unauthenticated backup reads and writes before body parsing", async () => {
  for (const fn of [GET, POST]) {
    const response = await fn(
      new Request("http://localhost/api/cloud", {
        method: fn === GET ? "GET" : "POST",
        ...(fn === POST ? { body: "invalid JSON" } : {}),
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
