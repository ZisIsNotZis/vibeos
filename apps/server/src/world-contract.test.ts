import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedWorld } from './world-contract.js';
import { worldRoot } from './paths.js';

test('world contract accepts unfamiliar node kinds and payloads', () => {
  const result = validateGeneratedWorld(worldRoot, { operationId: 'x', capability: 'surface:app-tetris:/play', intent: { type: 'open_surface', appId: 'app-tetris', route: '/play' }, input: {}, target: `${worldRoot}/apps/app-tetris` });
  assert.equal(result.ok, true);
});

test('world contract rejects an artifact outside the world tree', () => {
  const result = validateGeneratedWorld(worldRoot, { operationId: 'x', capability: 'surface:app-tetris:/play', intent: { type: 'open_surface', appId: 'app-tetris', route: '/play' }, input: {}, target: '/tmp/not-world' });
  assert.equal(result.ok, false);
});
