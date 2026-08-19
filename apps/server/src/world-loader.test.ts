import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from './world-loader.js';
import { worldRoot } from './paths.js';

test('resolves a nested entrypoint relative to its app serving root', () => {
  const surface = loadWorld(worldRoot).surfaces.find(item => item.appId === 'browser' && item.route === '/bestprogramminglanguage');
  assert.equal(surface?.entry, 'children/bestprogramminglanguage/entry.html');
});

test('loads an entrypoint-only app as a ready root surface', () => {
  const surface = loadWorld(worldRoot).surfaces.find(item => item.appId === 'app-codex' && item.route === '/');
  assert.equal(surface?.status, 'ready');
  assert.equal(surface?.entry, 'entry.html');
});
