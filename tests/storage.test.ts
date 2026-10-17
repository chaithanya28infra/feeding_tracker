import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadState, saveState } from "../lib/storage";
import { initialState, totals } from "../lib/model";
test("IndexedDB recovers active timer and notes after a fresh read", async () => {
  const state = {
    ...initialState,
    timer: {
      id: "persisted-timer",
      start: 1000,
      side: "left" as const,
      paused: false,
      notes: "A remembered note",
      segments: [{ side: "left" as const, start: 1000, end: null }],
    },
  };
  await saveState(state);
  const recovered = await loadState();
  assert.equal(recovered.timer?.notes, "A remembered note");
  assert.deepEqual(totals(recovered.timer!, 61000), { left: 60000, right: 0 });
});
test("local commits replace full state atomically without a network", async () => {
  const state = await loadState();
  state.events = [
    {
      id: "offline-uuid",
      kind: "diaper",
      type: "both",
      start: 1000,
      notes: "offline",
    },
  ];
  await saveState(state);
  const recovered = await loadState();
  assert.equal(recovered.events.length, 1);
  assert.equal(recovered.events[0].id, "offline-uuid");
  assert.equal(recovered.timer?.id, "persisted-timer");
});
