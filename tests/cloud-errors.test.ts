import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudDatabaseError } from "../lib/cloud-errors";

test("cloud failures retain the failing action and distinguish permissions from schema errors", () => {
  const denied = new CloudDatabaseError("create profile", "42501");
  assert.equal(denied.step, "create profile");
  assert.match(denied.message, /create profile \(42501\).*access was denied/);
  const missing = new CloudDatabaseError("save backup", "42703");
  assert.match(missing.message, /save backup \(42703\).*schema/);
  assert.equal(
    new CloudDatabaseError("load profiles", "PGRST205").code,
    "PGRST205",
  );
});
test("diagnostic errors never reflect arbitrary database error content", () => {
  const error = new CloudDatabaseError("save backup", "private row contents");
  assert.equal(error.code, "UNKNOWN");
  assert.doesNotMatch(error.message, /private row contents/);
});
