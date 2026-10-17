import { test } from "node:test";
import assert from "node:assert/strict";
import { setupCloudProfile } from "../lib/cloud-setup";
import { initialState } from "../lib/model";

const local = {
  ...initialState,
  baby: { ...initialState.baby, name: "Test baby", dob: "2026-01-01" },
};
test("first setup saves baby details, creates a backup, then enables revisioned sync", async () => {
  const steps: string[] = [];
  await setupCloudProfile(local, local.baby, {
    saveDetails: async (s) => {
      assert.equal(s.baby.dob, "2026-01-01");
      steps.push("local");
    },
    request: async (path, body) => {
      steps.push(path);
      if (body) return { babyId: "baby-a" };
      return { snapshot: local, revision: 1 };
    },
    created: (id) => {
      assert.equal(id, "baby-a");
      steps.push("select");
    },
    connect: async (id, value, revision) => {
      assert.equal(id, "baby-a");
      assert.equal(value.baby.name, "Test baby");
      assert.equal(revision, 1);
      steps.push("sync");
    },
  });
  assert.deepEqual(steps, [
    "local",
    "/api/cloud",
    "select",
    "/api/sync?babyId=baby-a",
    "sync",
  ]);
});
test("failed sync setup retains the created profile and does not falsely enable sync", async () => {
  let selected = "",
    connected = false;
  await assert.rejects(
    () =>
      setupCloudProfile(local, local.baby, {
        saveDetails: async () => {},
        request: async (_path, body) =>
          body ? { babyId: "saved-baby" } : { revision: 0 },
        created: (id) => {
          selected = id;
        },
        connect: async () => {
          connected = true;
        },
      }),
    /backup is saved/,
  );
  assert.equal(selected, "saved-baby");
  assert.equal(connected, false);
});
test("invalid baby details fail before any local or cloud writes", async () => {
  const unexpected = async () => {
    throw Error("Unexpected write");
  };
  await assert.rejects(
    () =>
      setupCloudProfile(
        local,
        { ...local.baby, dob: "" },
        {
          saveDetails: unexpected,
          request: unexpected,
          created: () => assert.fail(),
          connect: unexpected,
        },
      ),
    /date of birth/,
  );
});
