import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { worldRoot } from './paths.js';

test('Red Alert skirmish page has a complete acknowledgement flow', () => {
  const html = readFileSync(join(worldRoot, 'apps/app-command-conquer-red-alert-3/entry.html'), 'utf8');
  assert.match(html, /id=["']launch["']/);
  assert.match(html, /id=["']close["']/);
  assert.match(html, /id=["']deploy["']/);
  assert.match(html, /id=["']enter-theater["']/);
  assert.match(html, /faction/);
  assert.match(html, /battlefield|map/);
  assert.match(html, /difficulty/);
});
