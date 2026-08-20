import test from "node:test";
import assert from "node:assert/strict";
import { injectFrameBridge } from "./frame-bridge.js";

test("injects the VibeOS bridge into generated HTML without trusting app identity", () => {
  const html = injectFrameBridge("<!doctype html><html><head><title>App</title></head><body></body></html>");
  assert.match(html, /window\.vibeOS/);
  assert.match(html, /vibeos:ready/);
  assert.match(html, /vibeos:request/);
  assert.match(html, /operation timed out/);
  assert.equal((html.match(/data-vibeos-frame-bridge/g) ?? []).length, 1);
  assert.equal(injectFrameBridge(html), html);
});
