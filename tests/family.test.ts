import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../lib/model";
import { hasLocalCare, openFamilyBaby } from "../lib/family";

const saved = {
  ...initialState,
  baby: { ...initialState.baby, name: "Test baby", dob: "2026-01-01" },
};
test("a fresh device opens its existing baby without requiring profile or sync controls", async () => {
  let connected = false;
  await openFamilyBaby(initialState, "baby-a", {
    request: async (path) => {
      assert.match(path, /babyId=baby-a/);
      return { snapshot: saved, revision: 3 };
    },
    connect: async (id, state, revision) => {
      assert.equal(id, "baby-a");
      assert.equal(state.baby.name, "Test baby");
      assert.equal(revision, 3);
      connected = true;
    },
  });
  assert.equal(connected, true);
});
test("existing device logs never automatically combine with a different baby", async () => {
  await assert.rejects(
    () =>
      openFamilyBaby(
        { ...saved, baby: { ...saved.baby, name: "Another baby" } },
        "baby-a",
        {
          request: async () => ({ snapshot: saved, revision: 1 }),
          connect: async () => assert.fail("Must not combine different babies"),
        },
      ),
    /details on this device differ/,
  );
});
test("active timers and missing cloud history stop onboarding without changing logs", async () => {
  await assert.rejects(
    () =>
      openFamilyBaby(
        {
          ...saved,
          timer: {
            id: "timer",
            start: 1000,
            side: "left",
            paused: false,
            segments: [],
          },
        },
        "baby-a",
        {
          request: async () =>
            assert.fail("Must not read while a timer is active"),
          connect: async () => assert.fail(),
        },
      ),
    /active feeding/,
  );
  await assert.rejects(
    () =>
      openFamilyBaby(initialState, "baby-a", {
        request: async () => ({ snapshot: null, revision: 1 }),
        connect: async () => assert.fail(),
      }),
    /not available/,
  );
  assert.equal(hasLocalCare(initialState), false);
  assert.equal(hasLocalCare(saved), true);
});
