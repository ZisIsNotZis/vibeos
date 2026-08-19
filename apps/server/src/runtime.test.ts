import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentTask, RuntimeEvent } from '@vibeos/shared';
import { OperatingSystemRuntime, type AgentAdapter } from './runtime.js';

class FakeAgent implements AgentAdapter { tasks: AgentTask[] = []; async fulfill(task: AgentTask) { this.tasks.push(task); return { ok: true as const, capability: 'editor' }; } }
test('opens an app generically and focuses the new window', async () => {
  const events: RuntimeEvent[] = []; const runtime = new OperatingSystemRuntime(new FakeAgent(), { send: e => events.push(e) });
  const operation = await runtime.dispatch({ type: 'open_app', appId: 'calculator' });
  assert.equal(operation.state, 'ready'); assert.equal(runtime.snapshot().windows[0]?.appId, 'calculator');
  assert.equal(runtime.snapshot().windows[0]?.focused, true); assert.equal(events.at(-1)?.type, 'operation');
});
test('opens the App Shop root surface immediately', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  const operation = await runtime.dispatch({ type: 'open_surface', appId: 'shop', route: '/' });
  assert.equal(operation.state, 'ready');
  assert.equal(runtime.snapshot().windows[0]?.appId, 'shop');
  assert.equal(runtime.snapshot().surfaces.find(surface => surface.appId === 'shop' && surface.route === '/')?.status, 'ready');
  assert.equal(agent.tasks.length, 0);
});
test('loads a cached recursive child surface with its real content', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  const operation = await runtime.dispatch({ type: 'open_surface', appId: 'app-tetris', route: '/play' });
  const surface = runtime.snapshot().surfaces.find(item => item.appId === 'app-tetris' && item.route === '/play');
  assert.equal(operation.state, 'ready');
  assert.equal(surface?.content.heading, 'Tetris — Play');
  assert.notEqual(surface?.content.body, 'A world imagined for app-tetris at /play.');
});
test('opens the browser root surface immediately', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  const operation = await runtime.dispatch({ type: 'open_surface', appId: 'browser', route: '/' });
  assert.equal(operation.state, 'ready');
  assert.equal(runtime.snapshot().windows[0]?.appId, 'browser');
  assert.equal(runtime.snapshot().surfaces.find(surface => surface.appId === 'browser' && surface.route === '/')?.status, 'ready');
  assert.equal(agent.tasks.length, 0);
});
test('closes a window through the runtime interface', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'open_app', appId: 'calculator' }); const window = runtime.snapshot().windows[0]!;
  await runtime.dispatch({ type: 'close_window', windowId: window.id }); assert.equal(runtime.snapshot().windows.length, 0);
});
test('keeps the initial app route when reopening after navigating to a child surface', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'open_surface', appId: 'app-tetris', route: '/play' });
  await runtime.dispatch({ type: 'open_surface', appId: 'app-tetris', route: '/play/explore' });
  const window = runtime.snapshot().windows.at(-1)!;
  assert.equal(window.route, '/play/explore');
  await runtime.dispatch({ type: 'close_window', windowId: window.id });
  await runtime.dispatch({ type: 'open_app', appId: 'app-tetris' });
  assert.equal(runtime.snapshot().windows.at(-1)?.route, '/');
});
test('navigates within an app window instead of opening another window', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'open_app', appId: 'app-tetris' });
  await runtime.dispatch({ type: 'open_surface', appId: 'app-tetris', route: '/play' });
  assert.equal(runtime.snapshot().windows.length, 1);
  assert.equal(runtime.snapshot().windows[0]?.route, '/play');
});
test('installs an arbitrary app without generating it', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'install_app', app: { id: 'app-music', name: 'Music Studio', description: 'A studio', icon: 'music' } });
  assert.equal(runtime.snapshot().apps.find(app => app.id === 'app-music')?.status, 'placeholder');
});
test('app install is visible as a launcher-ready placeholder', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'install_app', app: { id: 'app-tetris', name: 'Tetris', description: 'A falling-block game', icon: 'sparkles' } });
  const app = runtime.snapshot().apps.find(item => item.id === 'app-tetris');
  assert.deepEqual({ name: app?.name, installed: app?.installed, status: app?.status }, { name: 'Tetris', installed: true, status: 'placeholder' });
});
test('app installation requests a generated identity artifact', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  await runtime.dispatch({ type: 'install_app', app: { id: 'app-poetry', name: 'Poetry House', description: 'A writing space', icon: '', category: 'Creative' } });
  assert.equal(agent.tasks.at(-1)?.capability, 'app:identity');
  assert.match(agent.tasks.at(-1)?.target ?? '', /world\/apps\/app-poetry$/);
});
test('fulfills an unavailable capability then resumes the original operation', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  const operation = await runtime.dispatch({ type: 'open_file', path: '/notes/today.txt' });
  assert.equal(operation.state, 'ready'); assert.equal(agent.tasks[0]?.intent.type, 'open_file'); assert.equal(runtime.snapshot().windows.length, 0);
});
test('sends an Assistant repair request with runtime context to the agent', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  const operation = await runtime.dispatch({ type: 'assistant_request', message: 'The Tetris icon is missing.', context: { nodeId: 'app-tetris', windowId: 'window-7' } });
  assert.equal(operation.state, 'ready');
  assert.equal(agent.tasks[0]?.capability, 'assistant:repair');
  assert.equal(agent.tasks[0]?.input && (agent.tasks[0].input as { message: string }).message, 'The Tetris icon is missing.');
  assert.equal((agent.tasks[0]?.input as { context: { nodeId?: string } }).context.nodeId, 'app-tetris');
  assert.equal(typeof (agent.tasks[0]?.input as { context: { recentLog?: string } }).context.recentLog, 'string');
});
