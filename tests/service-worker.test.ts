import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function worker() {
  const listeners: Record<string, (event: any) => void> = {};
  const removed: string[] = [],
    assets: string[] = [];
  const self = {
    location: { origin: "https://example.test" },
    addEventListener: (name: string, fn: (event: any) => void) => {
      listeners[name] = fn;
    },
    skipWaiting() {},
    clients: { claim() {} },
  };
  const caches = {
    keys: async () => [
      "nestlittlebaby-v4",
      "nestlittlebaby-v5",
      "other-app-cache",
    ],
    delete: async (key: string) => {
      removed.push(key);
    },
    open: async () => ({
      addAll: async (urls: string[]) => {
        assets.push(...urls);
      },
    }),
  };
  runInNewContext(
    readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, caches, URL, Response },
  );
  return { listeners, removed, assets };
}
test("service worker upgrades remove only old app-owned caches", async () => {
  const w = worker();
  let completion: Promise<unknown>;
  w.listeners.activate({
    waitUntil(p: Promise<unknown>) {
      completion = p;
    },
  });
  await completion!;
  assert.deepEqual(w.removed, ["nestlittlebaby-v4"]);
});
test("service worker never intercepts API requests, other origins, or writes", () => {
  const w = worker();
  let intercepted = false;
  for (const [url, method] of [
    ["https://example.test/api/private", "GET"],
    ["https://other.test/image.png", "GET"],
    ["https://example.test/", "POST"],
  ])
    w.listeners.fetch({
      request: { url, method },
      respondWith() {
        intercepted = true;
      },
    });
  assert.equal(intercepted, false);
});
test("offline shell install includes current brand and manifest", async () => {
  const w = worker();
  let completion: Promise<unknown>;
  w.listeners.install({
    waitUntil(p: Promise<unknown>) {
      completion = p;
    },
  });
  await completion!;
  for (const path of ["/", "/brand/nest-mark.png", "/manifest.webmanifest"])
    assert.ok(w.assets.includes(path));
});
