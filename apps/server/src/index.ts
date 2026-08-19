import { WebSocketServer } from 'ws';
import { OperatingSystemRuntime } from './runtime.js';
import { CodexAgentAdapter } from './codex-agent.js';
import type { Intent } from '@vibeos/shared';
import { log } from './logging.js';

const agent = new CodexAgentAdapter();
const clients = new Set<any>();
const runtime = new OperatingSystemRuntime(agent, { send(event) { const detail = event.type === 'operation' ? `${event.operation.id} ${event.operation.state}` : event.type === 'trace' ? `${event.operationId ?? '-'} ${event.message}` : ''; log('runtime', `${event.type} ${detail}`); const payload = JSON.stringify(event); for (const client of clients) if (client.readyState === 1) client.send(payload); } });
const server = new WebSocketServer({ port: Number(process.env.VIBEOS_PORT ?? 8787) });
server.on('error', error => log('server', 'websocket server error', String(error)));
server.on('connection', socket => { clients.add(socket); log('web', 'client connected'); socket.send(JSON.stringify({ type: 'snapshot', snapshot: runtime.snapshot() })); socket.on('message', async data => { try { const intent = JSON.parse(data.toString()) as Intent; log('web', 'intent', intent); await runtime.dispatch(intent); } catch (cause) { log('runtime', 'request failed', String(cause)); socket.send(JSON.stringify({ type: 'notification', message: 'The operation could not be completed.' })); } }); socket.on('close', () => { clients.delete(socket); log('web', 'client disconnected'); }); });
log('server', `VibeOS server listening on ws://localhost:${process.env.VIBEOS_PORT ?? 8787}`);
