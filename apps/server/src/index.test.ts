import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

test('HTTP health and WebSocket upgrade coexist without a duplicate response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibeos-http-'));
  const port = 38_000 + Math.floor(Math.random() * 1_000);
  const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'index.js')], {
    env: { ...process.env, VIBEOS_AGENT_MODE: 'deterministic', VIBEOS_PORT: String(port), VIBEOS_STATE_FILE: join(root, 'state.json') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  const url = `http://127.0.0.1:${port}/health`;
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try { if ((await fetch(url)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
      if (attempt === 39) throw new Error(`server did not start: ${output}`);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/assets/apps/not-installed/icon.svg`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/generated/apps/not-installed/missing.html`)).status, 404);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => { socket.once('open', () => resolve()); socket.once('error', reject); });
    assert.equal((await (await fetch(url)).json()).ok, true);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(child.exitCode, null, output);
    socket.close();
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
