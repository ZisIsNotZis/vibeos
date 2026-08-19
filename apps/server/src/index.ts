import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { OperatingSystemRuntime, worldRoot } from './runtime.js';
import { CodexAgentAdapter } from './codex-agent.js';
import type { Intent } from '@vibeos/shared';
import { log } from './logging.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const agent = new CodexAgentAdapter();
const clients = new Set<any>();
const runtime = new OperatingSystemRuntime(agent, { send(event) { const detail = event.type === 'operation' ? `${event.operation.id} ${event.operation.state}` : event.type === 'trace' ? `${event.operationId ?? '-'} ${event.message}` : ''; log('runtime', `${event.type} ${detail}`); const payload = JSON.stringify(event); for (const client of clients) if (client.readyState === 1) client.send(payload); } });
const port = Number(process.env.VIBEOS_PORT ?? 8787);
const http = createServer((request, response) => { if (request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true })); return; } const match = request.url?.match(/^\/assets\/apps\/([^/]+)\/icon\.svg$/); if (match) { try { response.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' }); response.end(readFileSync(join(worldRoot, 'apps', match[1], 'icon.svg'))); return; } catch {} } response.writeHead(404); response.end(); });
const server = new WebSocketServer({ server: http });
server.on('error', error => log('server', 'websocket server error', String(error)));
server.on('connection', socket => { clients.add(socket); log('web', 'client connected'); socket.send(JSON.stringify({ type: 'snapshot', snapshot: runtime.snapshot() })); socket.on('message', async data => { try { const intent = JSON.parse(data.toString()) as Intent; log('web', 'intent', intent); await runtime.dispatch(intent); } catch (cause) { log('runtime', 'request failed', String(cause)); socket.send(JSON.stringify({ type: 'notification', message: 'The operation could not be completed.' })); } }); socket.on('close', () => { clients.delete(socket); log('web', 'client disconnected'); }); });
http.listen(port, () => log('server', `VibeOS server listening on ws://localhost:${port}`));
