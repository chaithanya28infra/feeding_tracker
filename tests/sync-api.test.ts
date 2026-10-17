import { test } from "node:test";
import assert from "node:assert/strict";
import { GET, PUT } from "../app/api/sync/route";
test("sync endpoint rejects signed-out reads and writes before parsing the body", async () => {
  for (const fn of [GET, PUT]) {
    const response = await fn(
      new Request("http://localhost/api/sync", {
        method: fn === GET ? "GET" : "PUT",
        ...(fn === PUT ? { body: "not JSON" } : {}),
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
