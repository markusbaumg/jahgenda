// src/lib/share.js: one clipboard / share behaviour for every button (rows, Meine Shows, «Link zu dieser
// Auswahl», the feed sticker). navigator and window are faked per test. Run: make test.
import test from "node:test";
import assert from "node:assert/strict";
import { copyText, shareOr, waLink } from "../src/lib/share.js";

function withNavigator(nav, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  return Promise.resolve(fn()).finally(() => {
    if (desc) Object.defineProperty(globalThis, "navigator", desc);
    else delete globalThis.navigator;
  });
}

function withWindow(fn) {
  const opened = [];
  const had = "window" in globalThis;
  const prev = globalThis.window;
  globalThis.window = { open: (...args) => opened.push(args) };
  return Promise.resolve(fn(opened)).finally(() => {
    if (had) globalThis.window = prev;
    else delete globalThis.window;
  });
}

test("copyText: copied, denied, no clipboard, and a write that never answers", async () => {
  let written = "";
  await withNavigator({ clipboard: { writeText: async (t) => void (written = t) } }, async () => {
    assert.equal(await copyText("https://x/#m=1"), "copied");
  });
  assert.equal(written, "https://x/#m=1");
  await withNavigator(
    { clipboard: { writeText: async () => Promise.reject(new Error("denied")) } },
    async () => {
      assert.equal(await copyText("x"), "failed");
    },
  );
  await withNavigator({}, async () => assert.equal(await copyText("x"), "failed"));
  await withNavigator({ clipboard: { writeText: () => new Promise(() => {}) } }, async () => {
    assert.equal(await copyText("x", { timeout: 20 }), "failed");
  });
});

test("shareOr: shared, cancelled, and the WhatsApp fallback when share() fails or is missing", async () => {
  await withWindow(async (opened) => {
    await withNavigator({ share: async () => {} }, async () => {
      assert.equal(await shareOr({ url: "u" }, "https://wa.me/?text=u"), "shared");
    });
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    await withNavigator({ share: async () => Promise.reject(abort) }, async () => {
      assert.equal(await shareOr({ url: "u" }, "https://wa.me/?text=u"), "cancelled");
    });
    assert.deepEqual(opened, []);
    const denied = Object.assign(new Error("no"), { name: "NotAllowedError" });
    await withNavigator({ share: async () => Promise.reject(denied) }, async () => {
      assert.equal(await shareOr({ url: "u" }, "https://wa.me/?text=u"), "fallback");
    });
    await withNavigator({}, async () =>
      assert.equal(await shareOr({ url: "u" }, "https://wa.me/?text=v"), "fallback"),
    );
    assert.deepEqual(
      opened.map((a) => a[0]),
      ["https://wa.me/?text=u", "https://wa.me/?text=v"],
    );
    assert.deepEqual(opened[0].slice(1), ["_blank", "noopener"]);
  });
});

test("waLink: the text, encoded", () => {
  assert.equal(
    waLink("Meine Shows\nhttps://x/#m=1g"),
    "https://wa.me/?text=Meine%20Shows%0Ahttps%3A%2F%2Fx%2F%23m%3D1g",
  );
});
