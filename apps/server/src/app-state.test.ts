import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchAppState, readAppState, writeAppState } from './app-state.js';

test('persists app state and atomically applies a generic patch', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-state-'));
  try { writeAppState(root, 'app-anything', { tabs: [{ content: 'HELLO' }], active: 0 }); const next = patchAppState(root, 'app-anything', [{ op: 'replace', path: '/tabs/0/content', value: 'hello' }], 1); assert.equal(next.revision, 2); assert.deepEqual(readAppState(root, 'app-anything').state, { tabs: [{ content: 'hello' }], active: 0 }); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects stale or invalid generic state mutations', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-state-'));
  try { writeAppState(root, 'app-anything', { title: 'A' }); assert.throws(() => patchAppState(root, 'app-anything', [{ op: 'replace', path: '/title', value: 'B' }], 0), /changed/); assert.throws(() => patchAppState(root, 'app-anything', [{ op: 'replace', path: '/missing', value: 'B' }]), /does not exist/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});
