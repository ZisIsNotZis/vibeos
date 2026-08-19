import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentTask, RuntimeEvent } from '@vibeos/shared';
import { OperatingSystemRuntime, type AgentAdapter } from './runtime.js';

class FakeAgent implements AgentAdapter { tasks: AgentTask[] = []; async fulfill(task: AgentTask) { this.tasks.push(task); return { ok: true as const, capability: 'editor' }; } }
class DelayedAgent extends FakeAgent { async fulfill(task: AgentTask) { this.tasks.push(task); await new Promise(resolve => setTimeout(resolve, 20)); return { ok: true as const, capability: task.capability }; } }
class MemoryStore { value: any; load() { return this.value ?? { windows: [], operations: [], notifications: [], apps: [], surfaces: [], settings: { effort: 'quality', search: 'none' } }; } save(snapshot: any) { this.value = structuredClone(snapshot); } }
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
test('browser-like apps reuse cached Google and Baidu destinations', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'navigate_browser', appId: 'app-firefox', url: 'google.com' });
  const google = runtime.snapshot().surfaces.find(surface => surface.appId === 'app-firefox' && surface.route === '/google.com');
  assert.equal(google?.status, 'ready');
  assert.equal(google?.content.heading, 'Google');
  await runtime.dispatch({ type: 'navigate_browser', appId: 'app-firefox', url: 'baidu.com' });
  const baidu = runtime.snapshot().surfaces.find(surface => surface.appId === 'app-firefox' && surface.route === '/baidu.com');
  assert.equal(baidu?.status, 'ready');
  assert.equal(baidu?.content.heading, '百度一下');
});
test('reuses a generated destination route and its nested entrypoint', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  await runtime.dispatch({ type: 'open_surface', appId: 'browser', route: '/google.com' });
  const google = runtime.snapshot().surfaces.find(item => item.appId === 'browser' && item.route === '/google.com')!;
  await runtime.dispatch({ type: 'navigate_browser', appId: 'browser', url: 'bestprogramminglanguage', mode: 'destination' });
  const result = runtime.snapshot().surfaces.find(item => item.appId === 'browser' && item.route === '/bestprogramminglanguage');
  assert.equal(result?.entry, 'children/bestprogramminglanguage/entry.html');
  assert.equal(agent.tasks.length, 0);
});
test('Google search opens a results route instead of a matching destination route', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  await runtime.dispatch({ type: 'open_surface', appId: 'browser', route: '/google.com' });
  const google = runtime.snapshot().surfaces.find(item => item.appId === 'browser' && item.route === '/google.com')!;
  await runtime.dispatch({ type: 'activate_control', appId: 'browser', surfaceId: google.id, controlId: 'search-submit', input: { search: '沈阳芯源微实时ERP系统' } });
  assert.equal(runtime.snapshot().windows[0]?.route, '/google.com/search?q=沈阳芯源微实时ERP系统');
  assert.equal(((agent.tasks.at(-1)?.input as { original?: { source?: { mode?: string } } }).original?.source?.mode), 'search_results');
  assert.equal(agent.tasks.at(-1)?.capability, 'surface:browser:/google.com/search?q=沈阳芯源微实时ERP系统');
});
test('preserves Unicode browser search routes', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'navigate', target: '沈阳芯源微实时ERP系统' });
  assert.equal(runtime.snapshot().windows[0]?.route, '/沈阳芯源微实时ERP系统');
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
test('window geometry operations update the runtime model', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'open_app', appId: 'app-tetris' }); const id = runtime.snapshot().windows[0]!.id;
  await runtime.dispatch({ type: 'move_window', windowId: id, x: 220, y: 120 });
  await runtime.dispatch({ type: 'resize_window', windowId: id, width: 900, height: 620 });
  await runtime.dispatch({ type: 'maximize_window', windowId: id });
  assert.deepEqual(runtime.snapshot().windows[0], { ...runtime.snapshot().windows[0], state: 'maximized', position: { x: 220, y: 120 }, size: { width: 900, height: 620 } });
});
test('control activation follows the generated control intent instead of fabricating a route', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'open_surface', appId: 'app-tetris', route: '/play' });
  const surface = runtime.snapshot().surfaces.find(item => item.appId === 'app-tetris' && item.route === '/play')!;
  const start = surface.content.controls.find(control => control.id === 'start')!;
  await runtime.dispatch({ type: 'activate_control', appId: 'app-tetris', surfaceId: surface.id, controlId: start.id });
  assert.equal(runtime.snapshot().windows.length, 1);
  assert.equal(runtime.snapshot().windows[0]?.route, '/play/game');
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
test('passes open-ended parent context to generated-world work', async () => {
  const agent = new FakeAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  await runtime.dispatch({ type: 'open_surface', appId: 'app-future', route: '/new' });
  assert.equal(agent.tasks.at(-1)?.context?.acceptance?.includes('primary user action is usable'), true);
  assert.equal(Array.isArray(agent.tasks.at(-1)?.context?.existingFiles), true);
});
test('settings default to quality and none, update, persist, and reach generation', async () => {
  const agent = new FakeAgent(); const store = new MemoryStore(); const runtime = new OperatingSystemRuntime(agent, { send() {} }, store);
  assert.deepEqual(runtime.snapshot().settings, { effort: 'quality', search: 'none', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } });
  await runtime.dispatch({ type: 'set_setting', key: 'effort', value: 'research' });
  await runtime.dispatch({ type: 'set_setting', key: 'search', value: 'online_info' });
  assert.deepEqual(runtime.snapshot().settings, { effort: 'research', search: 'online_info', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } });
  const restored = new OperatingSystemRuntime(agent, { send() {} }, store);
  assert.deepEqual(restored.snapshot().settings, { effort: 'research', search: 'online_info', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } });
  await restored.dispatch({ type: 'open_surface', appId: 'app-future', route: '/settings-check' });
  assert.deepEqual(agent.tasks.at(-1)?.context?.settings, { effort: 'research', search: 'online_info', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } });
});
test('migrates old settings and persists appearance changes', async () => {
  const agent = new FakeAgent(); const store = new MemoryStore(); store.value = { windows: [], operations: [], notifications: [], apps: [], surfaces: [], settings: { effort: 'fast', search: 'none' } };
  const runtime = new OperatingSystemRuntime(agent, { send() {} }, store);
  assert.deepEqual(runtime.snapshot().settings.appearance, { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' });
  await runtime.dispatch({ type: 'set_appearance', key: 'mode', value: 'light' });
  await runtime.dispatch({ type: 'set_appearance', key: 'backgroundMode', value: 'pad' });
  assert.equal(runtime.snapshot().settings.appearance.mode, 'light');
  assert.equal(runtime.snapshot().settings.appearance.backgroundMode, 'pad');
  const restored = new OperatingSystemRuntime(agent, { send() {} }, store);
  assert.equal(restored.snapshot().settings.appearance.mode, 'light');
});
test('repairs stale persisted icon tokens from world manifests on startup', () => {
  const store = new MemoryStore(); store.value = { windows: [], operations: [], notifications: [], apps: [{ id: 'app-music', name: 'Music Studio', description: '', icon: 'music', installed: true, status: 'placeholder' }, { id: 'app-poetry', name: 'Poetry House', description: '', icon: '', installed: true, status: 'placeholder' }], surfaces: [], settings: { effort: 'quality', search: 'none' } };
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} }, store);
  assert.equal(runtime.snapshot().apps.find(app => app.id === 'app-music')?.icon, 'icon.svg');
  assert.equal(runtime.snapshot().apps.find(app => app.id === 'app-poetry')?.icon, 'icon.svg');
});
test('runs different page generations concurrently and deduplicates the same page', async () => {
  const agent = new DelayedAgent(); const runtime = new OperatingSystemRuntime(agent, { send() {} });
  await Promise.all([runtime.dispatch({ type: 'open_surface', appId: 'app-new-a', route: '/home' }), runtime.dispatch({ type: 'open_surface', appId: 'app-new-b', route: '/home' })]);
  assert.equal(agent.tasks.filter(task => task.capability.startsWith('surface:')).length, 2);
  const before = agent.tasks.length;
  await Promise.all([runtime.dispatch({ type: 'open_surface', appId: 'app-new-c', route: '/home' }), runtime.dispatch({ type: 'open_surface', appId: 'app-new-c', route: '/home' })]);
  assert.equal(agent.tasks.length - before, 1);
});
test('reopening a minimized app restores and focuses its existing window', async () => {
  const runtime = new OperatingSystemRuntime(new FakeAgent(), { send() {} });
  await runtime.dispatch({ type: 'open_app', appId: 'app-tetris' }); const first = runtime.snapshot().windows[0]!;
  await runtime.dispatch({ type: 'minimize_window', windowId: first.id });
  await runtime.dispatch({ type: 'open_app', appId: 'app-tetris' });
  assert.equal(runtime.snapshot().windows.length, 1); assert.equal(runtime.snapshot().windows[0]?.state, 'normal'); assert.equal(runtime.snapshot().windows[0]?.focused, true);
});
