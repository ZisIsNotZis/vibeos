import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { OperatingSystemRuntime } from './runtime.js';
import { worldRoot } from './paths.js';
import { CodexAgentAdapter } from './codex-agent.js';
import type { AgentResult, AgentTask, RuntimeIntent } from '@vibeos/shared';
import { log } from './logging.js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js/lib/common';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { injectFrameBridge } from './frame-bridge.js';

const runtimeStateFile = process.env.VIBEOS_STATE_FILE ?? join(worldRoot, '.runtime-state.json');
const store = {
  load() {
    try { return JSON.parse(readFileSync(runtimeStateFile, 'utf8')); }
    catch { return { windows: [], operations: [], notifications: [], apps: [], surfaces: [], settings: { model: 'terra', useGhPrefix: false, reasoning: 'high', effort: 'quality', search: 'none', generationVisibility: 'completion', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom', uiTypeface: 'modern', monoTypeface: 'modern', displayScale: 'default' } } }; }
  },
  save(snapshot: unknown) {
    mkdirSync(dirname(runtimeStateFile), { recursive: true });
    writeFileSync(runtimeStateFile, JSON.stringify(snapshot, null, 2) + '\n');
  }
};
const clients = new Set<any>();
const bridgeRequesters = new Map<string, any>();
let runtime: OperatingSystemRuntime;
const agent = process.env.VIBEOS_AGENT_MODE === 'deterministic'
  ? { async fulfill(task: AgentTask): Promise<AgentResult> { return { ok: true, capability: task.capability }; } }
  : new CodexAgentAdapter(undefined, event => { if (event.kind === 'end') runtime.completeTask(event.taskId, event.title, event.text, event.status !== 'error'); else runtime.reportTask(event.taskId, event.title, event.kind, event.text); });
runtime = new OperatingSystemRuntime(agent, { send(event) { const detail = event.type === 'operation' ? `${event.operation.id} ${event.operation.state}` : event.type === 'trace' ? `${event.operationId ?? '-'} ${event.message}` : ''; log('runtime', `${event.type} ${detail}`); const payload = JSON.stringify(event); if (event.type === 'bridge_result') { const client = bridgeRequesters.get(event.requestId); bridgeRequesters.delete(event.requestId); if (client?.readyState === 1) client.send(payload); return; } for (const client of clients) if (client.readyState === 1) client.send(payload); } }, store);
const port = Number(process.env.VIBEOS_PORT ?? 8787);
const markdownCss = `:root{--vibe-code-bg:#0d1117;--vibe-code-text:#c9d1d9;--vibe-code-border:#30363d}body{margin:0;padding:18px;background:var(--vibe-surface,#191923);color:var(--vibe-text,#f1f1f6);font:15px/1.6 system-ui,sans-serif}pre{overflow:auto;padding:14px;border:1px solid var(--vibe-code-border);border-radius:8px;background:var(--vibe-code-bg);color:var(--vibe-code-text)}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}p code,li code{padding:.15em .35em;border-radius:4px;background:var(--vibe-control,#303044)}a{color:var(--vibe-accent,#a89dfc)}`;
const markdownRenderer = new Renderer();
markdownRenderer.code = ({ text, lang }) => { const language = lang && hljs.getLanguage(lang) ? lang : undefined; return `<pre><code class="hljs${language ? ` language-${language}` : ''}">${language ? hljs.highlight(text, { language }).value : hljs.highlightAuto(text).value}</code></pre>`; };
const renderMarkdown = (source: string) => marked.parse(source, { async: false, renderer: markdownRenderer });
const http = createServer((request, response) => { if (request.headers.upgrade?.toLowerCase() === 'websocket' || response.headersSent || response.writableEnded) return; const finish = (status: number, headers: Record<string, string>, body: string | Buffer) => { if (response.headersSent || response.writableEnded) return; response.writeHead(status, headers); response.end(body); }; if (request.url === '/health') { finish(200, { 'content-type': 'application/json' }, JSON.stringify({ ok: true })); return; } const match = request.url?.match(/^\/assets\/apps\/([^/]+)\/icon\.svg$/); if (match) { try { finish(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' }, readFileSync(join(worldRoot, 'apps', match[1], 'icon.svg'))); return; } catch {} } const generated = request.url?.match(/^\/generated\/apps\/([^/]+)\/(.+)$/); if (generated) { try { const safeApp = decodeURIComponent(generated[1]); const rel = decodeURIComponent(generated[2]); if (rel.includes('..') || rel.startsWith('/')) throw new Error('invalid path'); const path = join(worldRoot, 'apps', safeApp, rel); const markdown = rel.endsWith('.md') || rel.endsWith('.markdown'); const contentType = markdown ? 'text/html' : rel.endsWith('.html') ? 'text/html' : rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.svg') ? 'image/svg+xml' : rel.endsWith('.png') ? 'image/png' : rel.endsWith('.jpg') || rel.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream'; const body = readFileSync(path, 'utf8'); finish(200, { 'content-type': contentType, 'cache-control': 'no-cache' }, markdown ? injectFrameBridge(`<!doctype html><html><head><meta charset="utf-8"><style>${markdownCss}</style></head><body>${renderMarkdown(body)}</body></html>`) : rel.endsWith('.html') ? injectFrameBridge(body) : body); return; } catch {} } finish(404, {}, ''); });
const server = new WebSocketServer({ server: http });
server.on('error', error => log('server', 'websocket server error', String(error)));
server.on('connection', socket => { clients.add(socket); log('web', 'client connected'); socket.send(JSON.stringify({ type: 'snapshot', snapshot: runtime.snapshot() })); socket.on('message', async data => { try { const intent = JSON.parse(data.toString()) as RuntimeIntent; if (intent.type === 'bridge_request') bridgeRequesters.set(intent.requestId, socket); log('web', 'intent', intent); await runtime.dispatch(intent); } catch (cause) { log('runtime', 'request failed', String(cause)); socket.send(JSON.stringify({ type: 'notification', message: 'The operation could not be completed.' })); } }); socket.on('close', () => { clients.delete(socket); for (const [id, client] of bridgeRequesters) if (client === socket) bridgeRequesters.delete(id); log('web', 'client disconnected'); }); });
http.listen(port, () => log('server', `VibeOS server listening on ws://localhost:${port}`));
