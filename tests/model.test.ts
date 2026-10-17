import { test } from "node:test";
import assert from "node:assert/strict";
import {
  totals,
  changeTimer,
  diaperCounts,
  dayKey,
  mergeById,
  type Timer,
  type Diaper,
} from "../lib/model";
const timer: Timer = {
  id: "one",
  start: 1000,
  side: "left",
  paused: false,
  segments: [{ side: "left", start: 1000, end: null }],
};
test("timer uses timestamps after background/restart", () =>
  assert.deepEqual(totals(JSON.parse(JSON.stringify(timer)), 121000), {
    left: 120000,
    right: 0,
  }));
test("switching keeps separate side totals", () =>
  assert.deepEqual(totals(changeTimer(timer, "right", 61000), 91000), {
    left: 60000,
    right: 30000,
  }));
test("pause excludes paused time; resume continues", () => {
  const paused = changeTimer(timer, "pause", 11000);
  assert.equal(totals(paused, 999999).left, 10000);
  assert.equal(totals(changeTimer(paused, "resume", 21000), 31000).left, 20000);
});
const diaper = (id: string, type: Diaper["type"]): Diaper => ({
  id,
  kind: "diaper",
  start: 1,
  type,
  notes: "",
});
test("both increments both counts, one total change", () =>
  assert.deepEqual(
    diaperCounts([
      diaper("a", "both"),
      diaper("b", "wet"),
      diaper("c", "dirty"),
    ]),
    { wet: 2, dirty: 2, total: 3 },
  ));
test("idempotent event replacement prevents duplicates", () =>
  assert.equal(mergeById([diaper("a", "wet")], diaper("a", "both")).length, 1));
test("timezone date rolls back at midnight UTC", () =>
  assert.equal(
    dayKey(Date.parse("2026-10-17T02:00:00Z"), "America/Phoenix"),
    "2026-10-16",
  ));
test("DST fall back retains same local date", () =>
  assert.equal(
    dayKey(Date.parse("2026-11-01T05:30:00Z"), "America/New_York"),
    dayKey(Date.parse("2026-11-01T06:30:00Z"), "America/New_York"),
  ));
