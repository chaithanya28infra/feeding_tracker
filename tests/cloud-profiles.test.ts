import { test } from "node:test";
import assert from "node:assert/strict";
import { preferredCloudProfile } from "../lib/cloud-profiles";
import type { SyncBinding } from "../lib/sync-model";

test("settings restores the linked baby and selects a sole accessible cloud profile", () => {
  const binding = { userId: "parent-a", babyId: "baby-b" } as SyncBinding;
  assert.equal(
    preferredCloudProfile(
      [{ id: "baby-a" }, { id: "baby-b" }],
      "parent-a",
      binding,
    ),
    "baby-b",
  );
  assert.equal(
    preferredCloudProfile([{ id: "baby-a" }], "parent-a", null),
    "baby-a",
  );
  assert.equal(preferredCloudProfile([], "parent-a", binding), "");
  assert.equal(
    preferredCloudProfile(
      [{ id: "baby-a" }, { id: "baby-b" }],
      "parent-b",
      binding,
    ),
    "",
    "another account’s binding must not choose a baby",
  );
  assert.equal(
    preferredCloudProfile(
      [{ id: "baby-a" }, { id: "baby-c" }],
      "parent-a",
      binding,
    ),
    "",
    "missing access must not silently choose a different baby",
  );
});
