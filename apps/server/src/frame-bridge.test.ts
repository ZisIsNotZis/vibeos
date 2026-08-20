import test from "node:test";
import assert from "node:assert/strict";
import { injectFrameBridge } from "./frame-bridge.js";

test("injects the VibeOS bridge into generated HTML without trusting app identity", () => {
  const html = injectFrameBridge("<!doctype html><html><head><title>App</title></head><body></body></html>");
  assert.match(html, /window\.vibeOS/);
  assert.match(html, /vibeos:ready/);
  assert.match(html, /vibeos:request/);
  assert.doesNotMatch(html, /parent\.postMessage\(\{type:"vibeos:ready",channel\}/);
  assert.match(html, /state\.read/);
  assert.match(html, /notify:/);
  assert.match(html, /subscribe:listener/);
  assert.match(html, /operation timed out/);
  assert.match(html, /vibeos:ime-toggle/);
  assert.match(html, /vibeos:ime-key/);
  assert.match(html, /vibeos:ime-commit/);
  assert.match(html, /vibeos:context-menu/);
  assert.match(html, /contextMenu:Object.freeze/);
  assert.match(html, /data-vibeos-typography/);
  assert.match(html, /data-vibeos-typography-override/);
  assert.match(html, /--vibe-text-body/);
  assert.match(html, /applyTypography/);
  assert.match(html, /data-display-scale/);
  assert.doesNotMatch(html, /files:Object\.freeze/);
  assert.equal((html.match(/data-vibeos-frame-bridge/g) ?? []).length, 1);
  assert.equal(injectFrameBridge(html), html);
});
