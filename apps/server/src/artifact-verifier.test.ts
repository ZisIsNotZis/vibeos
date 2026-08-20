import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyArtifact } from "./artifact-verifier.js";

test("artifact verifier rejects broken local assets before publication", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibeos-verify-"));
  writeFileSync(join(root, "node.json"), JSON.stringify({ id: "app-example", title: "Example", kind: "app", entry: "entry.html", children: [] }));
  writeFileSync(join(root, "entry.html"), "<!doctype html><html><body><img src=\"missing.png\"></body></html>");
  const report = await verifyArtifact(root, "fast", join(root, "evidence"));
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /missing local asset/);
});

test("artifact verifier accepts a loadable identity artifact without browser work", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibeos-verify-")); mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, "node.json"), JSON.stringify({ id: "app-example", title: "Example", kind: "app", children: [] }));
  const report = await verifyArtifact(root, "quality", join(root, "evidence"));
  assert.deepEqual(report, { ok: true, errors: [], warnings: [], scenarios: [] });
});
