import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateGeneratedWorld } from './world-contract.js';
import { loadWorld } from './world-loader.js';
import { worldRoot } from './paths.js';

test('world contract accepts unfamiliar node kinds and payloads', () => {
  const result = validateGeneratedWorld(worldRoot, { operationId: 'x', capability: 'surface:app-tetris:/play', intent: { type: 'open_surface', appId: 'app-tetris', route: '/play' }, input: {}, target: `${worldRoot}/apps/app-tetris` });
  assert.equal(result.ok, true);
});

test('world contract rejects an artifact outside the world tree', () => {
  const result = validateGeneratedWorld(worldRoot, { operationId: 'x', capability: 'surface:app-tetris:/play', intent: { type: 'open_surface', appId: 'app-tetris', route: '/play' }, input: {}, target: '/tmp/not-world' });
  assert.equal(result.ok, false);
});

test('loads a surface without optional controls', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-world-'));
  const app = join(root, 'apps', 'app-example');
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, 'node.json'), JSON.stringify({ id: 'app-example', title: 'Example', kind: 'app', surface: { heading: 'Example', body: 'Ready' } }));
  const world = loadWorld(root);
  assert.equal(world.surfaces[0]?.route, '/');
  assert.deepEqual(world.surfaces[0]?.content.controls, []);
});
