import { test } from "node:test";
import assert from "node:assert/strict";
import { invitationToken, invitationEmail } from "../lib/invitations";
import { GET, POST } from "../app/api/caregivers/route";
import { snapshot, reconcile } from "../lib/sync-model";
import { initialState, type Diaper } from "../lib/model";
const token = "a".repeat(64);
test("invites accept raw codes and fragments without opening links", () => {
  assert.equal(invitationToken(token.toUpperCase()), token);
  assert.equal(
    invitationToken(`https://example.test/#caregiver-invite=${token}`),
    token,
  );
});
test("invite parsing rejects short, malformed and query-string tokens", () => {
  for (const text of [
    "abc",
    "z".repeat(64),
    "https://example.test/?caregiver-invite=" + token,
  ])
    assert.throws(() => invitationToken(text));
});
test("invite emails are normalized and validated", () => {
  assert.equal(invitationEmail(" Parent@Example.com "), "parent@example.com");
  for (const email of ["not-email", "a@b", "a @example.com", null])
    assert.throws(() => invitationEmail(email));
});
test("caregiver API rejects signed-out listing and redemption before parsing tokens", async () => {
  for (const fn of [GET, POST]) {
    const response = await fn(
      new Request("http://localhost/api/caregivers", {
        method: fn === GET ? "GET" : "POST",
        ...(fn === POST ? { body: "not JSON" } : {}),
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
test("server attribution does not create false sync conflicts with in-flight local edits", () => {
  const e: Diaper = {
    id: "id",
    kind: "diaper",
    start: 1000,
    type: "wet",
    notes: "",
  };
  const base = snapshot({ ...initialState, events: [e] });
  const local = snapshot({
    ...initialState,
    events: [{ ...e, notes: "edited during upload" }],
  });
  const remote = snapshot({
    ...initialState,
    events: [
      {
        ...e,
        createdBy: "server-user",
        createdByName: "Dad",
        updatedBy: "server-user",
        updatedByName: "Dad",
      },
    ],
  });
  const m = reconcile(base, local, remote);
  assert.equal(m.conflicts.length, 0);
  assert.equal(m.value.events[0].notes, "edited during upload");
  const synced = reconcile(base, base, remote);
  assert.equal(synced.value.events[0].createdBy, "server-user");
});
