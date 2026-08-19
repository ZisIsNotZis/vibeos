import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { OperatingSystemRuntime } from './runtime.js';
import { worldRoot } from './paths.js';
import { CodexAgentAdapter } from './codex-agent.js';
import type { Intent } from '@vibeos/shared';
import { log } from './logging.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';

const agent = new CodexAgentAdapter();
const runtimeStateFile = process.env.VIBEOS_STATE_FILE ?? join(worldRoot, '.runtime-state.json');
const store = {
  load() {
    try { return JSON.parse(readFileSync(runtimeStateFile, 'utf8')); }
    catch { return { windows: [], operations: [], notifications: [], apps: [], surfaces: [], settings: { effort: 'quality', search: 'none', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } } }; }
  },
  save(snapshot: unknown) {
    mkdirSync(dirname(runtimeStateFile), { recursive: true });
    writeFileSync(runtimeStateFile, JSON.stringify(snapshot, null, 2) + '\n');
  }
};
const clients = new Set<any>();
const runtime = new OperatingSystemRuntime(agent, { send(event) { const detail = event.type === 'operation' ? `${event.operation.id} ${event.operation.state}` : event.type === 'trace' ? `${event.operationId ?? '-'} ${event.message}` : ''; log('runtime', `${event.type} ${detail}`); const payload = JSON.stringify(event); for (const client of clients) if (client.readyState === 1) client.send(payload); } }, store);
const port = Number(process.env.VIBEOS_PORT ?? 8787);
const http = createServer((request, response) => { if (request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true })); return; } const match = request.url?.match(/^\/assets\/apps\/([^/]+)\/icon\.svg$/); if (match) { try { response.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' }); response.end(readFileSync(join(worldRoot, 'apps', match[1], 'icon.svg'))); return; } catch {} } const generated = request.url?.match(/^\/generated\/apps\/([^/]+)\/(.+)$/); if (generated) { try { const safeApp = decodeURIComponent(generated[1]); const rel = decodeURIComponent(generated[2]); if (rel.includes('..') || rel.startsWith('/')) throw new Error('invalid path'); const path = join(worldRoot, 'apps', safeApp, rel); const contentType = rel.endsWith('.html') ? 'text/html' : rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.svg') ? 'image/svg+xml' : rel.endsWith('.png') ? 'image/png' : rel.endsWith('.jpg') || rel.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream'; response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-cache' }); response.end(readFileSync(path)); return; } catch {} } response.writeHead(404); response.end(); });
const server = new WebSocketServer({ server: http });
server.on('error', error => log('server', 'websocket server error', String(error)));
server.on('connection', socket => { clients.add(socket); log('web', 'client connected'); socket.send(JSON.stringify({ type: 'snapshot', snapshot: runtime.snapshot() })); socket.on('message', async data => { try { const intent = JSON.parse(data.toString()) as Intent; log('web', 'intent', intent); await runtime.dispatch(intent); } catch (cause) { log('runtime', 'request failed', String(cause)); socket.send(JSON.stringify({ type: 'notification', message: 'The operation could not be completed.' })); } }); socket.on('close', () => { clients.delete(socket); log('web', 'client disconnected'); }); });
http.listen(port, () => log('server', `VibeOS server listening on ws://localhost:${port}`));
