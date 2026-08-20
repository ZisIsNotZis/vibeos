import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { worldRoot } from './paths.js';

test('Red Alert skirmish page has a complete deployment flow', () => {
  const html = readFileSync(join(worldRoot, 'apps/app-command-conquer-red-alert-3/entry.html'), 'utf8');
  assert.match(html, /id=["']enter["']/);
  assert.match(html, /id=["']mcv["']/);
  assert.match(html, /id=["']build["']/);
  assert.match(html, /id=["']exit["']/);
  assert.match(html, /faction/);
  assert.match(html, /battlefield|canvas|map/);
  assert.match(html, /campaign|skirmish/i);
});

test('DOTA2 skirmish page enters a playable 3D match instead of stopping at a map mock', () => {
  const html = readFileSync(join(worldRoot, 'apps/app-dota2/index.html'), 'utf8');
  assert.match(html, /id=["']start-game["']/);
  assert.match(html, /id=["']game-screen["']/);
  assert.match(html, /id=["']game-canvas["']/);
  assert.match(html, /data-lane=["']top["']/);
  assert.match(html, /data-lane=["']middle["']/);
  assert.match(html, /data-lane=["']bottom["']/);
  assert.match(html, /id=["']enemy-health["']/);
  assert.match(html, /id=["']combat-log["']/);
  assert.match(html, /id=["']minimap-canvas["']/);
  assert.match(html, /WebGL|webgl/i);
  assert.match(html, /requestAnimationFrame/);
  assert.match(html, /keydown/);
  assert.match(html, /pointerdown/);
  assert.match(html, /data-ability=["']Q["']/);
  assert.match(html, /data-ability=["']W["']/);
  assert.match(html, /damage|attack/i);
  assert.match(html, /window\.vibeOS\?\.storage/);
});
