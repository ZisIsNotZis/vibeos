import type { AgentResult, AgentTask, AppRecord, Intent, Operation, RuntimeEvent, RuntimeSnapshot, Surface, WindowModel, RuntimeIntent } from '@vibeos/shared';
import { log, recentLog } from './logging.js';
import { loadWorld } from './world-loader.js';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export interface AgentAdapter { fulfill(task: AgentTask): Promise<AgentResult>; }
export interface RuntimePort { send(event: RuntimeEvent): void; }
export interface WorldStore { load(): RuntimeSnapshot; save(snapshot: RuntimeSnapshot): void; }
export const worldRoot = process.env.VIBEOS_WORLD_ROOT ?? fileURLToPath(new URL('../../../world', import.meta.url));
const world = loadWorld(worldRoot);
const seedApps: AppRecord[] = world.apps.length ? world.apps : [{ id: 'assistant', name: 'Assistant', description: 'Repair and shape your VibeOS world', icon: 'icon.svg', category: 'System', installed: true, status: 'available' }];
const seedSurfaces: Surface[] = world.surfaces;
function readWorldNode(appRoot: string) { return existsSync(join(appRoot, 'node.json')); }
export class OperatingSystemRuntime {
  private state: RuntimeSnapshot; private sequence = 0;
  constructor(private readonly agent: AgentAdapter, private readonly port: RuntimePort, private readonly store?: WorldStore) { this.state = store?.load() ?? { windows: [], operations: [], notifications: [], apps: seedApps, surfaces: seedSurfaces }; }
  snapshot() { return structuredClone(this.state); }
  async dispatch(intent: RuntimeIntent): Promise<Operation> {
    const operation: Operation = { id: `op-${++this.sequence}`, intent, state: 'pending' }; this.state.operations.push(operation); this.trace(operation.id, `accepted ${intent.type}`); this.emit({ type: 'operation', operation });
    try {
      switch (intent.type) {
        case 'assistant_request': await this.assistant(operation.id, intent); break;
        case 'open_app': { const window = this.openApp(intent.appId); await this.ensureSurface(intent.appId, '/', window.id); break; }
        case 'open_surface': { const window = this.openOrNavigateApp(intent.appId, intent.route); await this.ensureSurface(intent.appId, intent.route, window.id); break; }
        case 'navigate': { const route = this.route(intent.target); const window = this.openOrNavigateApp('browser', route); await this.ensureSurface('browser', route, window.id); break; }
        case 'install_app': await this.install(operation.id, intent.app); break;
        case 'close_window': this.state.windows = this.state.windows.filter(window => window.id !== intent.windowId); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); break;
        case 'focus_window': this.focus(intent.windowId); break;
        case 'minimize_window': this.changeWindow(intent.windowId, 'minimized'); break;
        case 'maximize_window': this.toggleMaximize(intent.windowId); break;
        case 'move_window': this.moveWindow(intent.windowId, intent.x, intent.y); break;
        case 'resize_window': this.resizeWindow(intent.windowId, intent.width, intent.height); break;
        case 'activate_control': { const window = this.state.windows.find(item => item.appId === intent.appId && item.focused); const surface = this.state.surfaces.find(item => item.id === intent.surfaceId); const control = surface?.content.controls.find(item => item.id === intent.controlId); if (!control) throw new Error('The selected control is no longer available.'); if (control.action.type === 'activate_control') { this.trace(operation.id, `control ${intent.controlId} acknowledged`); break; } await this.dispatch(control.action); break; }
        case 'navigate_browser': { const route = this.route(intent.url); const window = this.openOrNavigateApp('browser', route); await this.ensureSurface('browser', route, window.id); break; }
        case 'open_file': case 'create_file': { const result = await this.agent.fulfill({ operationId: operation.id, capability: intent.type, intent, input: intent, target: `cache/files/${intent.type}` }); if (!result.ok) throw new Error(result.message); break; }
        case 'search_apps': break;
      }
      return this.finish(operation);
    } catch (cause) { return this.fail(operation, cause instanceof Error ? cause.message : 'The operation could not be completed.'); }
  }
  private async assistant(operationId: string, intent: Extract<RuntimeIntent, { type: 'assistant_request' }>) {
    const context = { ...intent.context, recentOperations: this.state.operations.slice(-8).map(item => `${item.intent.type}:${item.state}`), recentLog: recentLog() };
    this.trace(operationId, 'Assistant is preparing a repair');
    const result = await this.agent.fulfill({ operationId, capability: 'assistant:repair', intent, input: { message: intent.message, context }, target: 'world' });
    if (!result.ok) throw new Error(result.message);
    this.trace(operationId, 'Assistant repair handed back to VibeOS');
    this.reloadWorld();
  }
  private reloadWorld() {
    const next = loadWorld(worldRoot);
    this.state.apps = next.apps.length ? next.apps : this.state.apps;
    this.state.surfaces = [...this.state.surfaces.filter(surface => surface.status !== 'ready'), ...next.surfaces];
    this.emit({ type: 'snapshot', snapshot: this.snapshot() });
  }
  private async ensureSurface(appId: string, route: string, windowId?: string) { const current = this.state.surfaces.find(surface => surface.appId === appId && surface.route === route); if (current?.status === 'ready') { if (windowId) this.updateWindowRoute(windowId, route); this.trace(`surface:${appId}:${route}`, 'cache hit'); return; } const surface: Surface = current ?? { id: `surface-${++this.sequence}`, appId, route, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, status: 'generating', content: { heading: 'Preparing your space', body: 'This place is taking shape.', controls: [] } }; if (!current) this.state.surfaces.push(surface); if (windowId) this.updateWindowRoute(windowId, route); this.trace(`surface:${appId}:${route}`, 'generation requested'); this.emit({ type: 'surface', surface }); const result = await this.agent.fulfill({ operationId: `surface-${surface.id}`, capability: `surface:${appId}:${route}`, intent: { type: 'open_surface', appId, route }, input: { appId, route }, target: join(worldRoot, 'apps', appId) }); if (!result.ok) throw new Error(result.message); const refreshed = loadWorld(worldRoot); const generated = refreshed.surfaces.find(item => item.appId === appId && item.route === route); if (!generated && existsSync(join(worldRoot, 'apps', appId, 'node.json'))) throw new Error(`Generated surface artifact was not found for ${appId} ${route}.`); const generatedApp = refreshed.apps.find(app => app.id === appId); const app = this.state.apps.find(item => item.id === appId); if (app && generatedApp?.icon) app.icon = generatedApp.icon; if (app && generated) app.status = 'available'; surface.status = 'ready'; surface.content = generated?.content ?? surface.content; this.trace(`surface:${appId}:${route}`, 'ready'); this.emit({ type: 'surface', surface }); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private async install(operationId: string, app: AppRecord | import('@vibeos/shared').AppSpec) { log('runtime', 'installing app', app); const existing = this.state.apps.find(item => item.id === app.id); if (existing) { existing.installed = true; existing.status = 'placeholder'; } else { this.state.apps.push({ ...app, status: 'placeholder', installed: true }); } this.emit({ type: 'snapshot', snapshot: this.snapshot() }); const result = await this.agent.fulfill({ operationId, capability: 'app:identity', intent: { type: 'install_app', app }, input: app, target: join(worldRoot, 'apps', app.id) }); if (!result.ok) throw new Error(result.message); const appRoot = join(worldRoot, 'apps', app.id); if (!readWorldNode(appRoot)) { mkdirSync(appRoot, { recursive: true }); writeFileSync(join(appRoot, 'node.json'), JSON.stringify({ id: app.id, title: app.name, kind: 'app', status: 'placeholder', icon: app.icon, children: [] }, null, 2) + '\n'); } const generated = loadWorld(worldRoot).apps.find(item => item.id === app.id); const stateApp = this.state.apps.find(item => item.id === app.id); if (generated && stateApp) { stateApp.icon = generated.icon; stateApp.name = generated.name; } this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private openApp(appId: string, route = '/') { this.state.windows = this.state.windows.map(window => ({ ...window, focused: false })); const window: WindowModel = { id: `window-${++this.sequence}`, appId, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, route, state: 'normal', focused: true, position: { x: 120 + (this.sequence % 4) * 28, y: 72 + (this.sequence % 4) * 24 }, size: { width: 760, height: 500 } }; this.state.windows.push(window); this.emit({ type: 'window', window }); return window; }
  private openOrNavigateApp(appId: string, route: string) { const existing = this.state.windows.find(window => window.appId === appId); if (!existing) return this.openApp(appId, route); this.state.windows = this.state.windows.map(window => ({ ...window, focused: window.id === existing.id })); existing.route = route; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); return existing; }
  private updateWindowRoute(id: string, route: string) { const window = this.state.windows.find(item => item.id === id); if (window) { window.route = route; this.emit({ type: 'window', window }); } }
  private focus(id: string) { this.state.windows = this.state.windows.map(window => ({ ...window, focused: window.id === id })); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private changeWindow(id: string, state: WindowModel['state']) { const window = this.state.windows.find(item => item.id === id); if (window) window.state = state; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private toggleMaximize(id: string) { const window = this.state.windows.find(item => item.id === id); if (window) window.state = window.state === 'maximized' ? 'normal' : 'maximized'; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private moveWindow(id: string, x: number, y: number) { const window = this.state.windows.find(item => item.id === id); if (window) window.position = { x: Math.max(0, x), y: Math.max(42, y) }; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private resizeWindow(id: string, width: number, height: number) { const window = this.state.windows.find(item => item.id === id); if (window) window.size = { width: Math.max(360, width), height: Math.max(260, height) }; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private finish(operation: Operation) { operation.state = 'ready'; this.persist(); this.emit({ type: 'operation', operation }); return operation; }
  private fail(operation: Operation, message: string) { operation.state = 'failed'; operation.message = message; this.state.notifications.push(message); this.emit({ type: 'operation', operation }); this.emit({ type: 'notification', message }); return operation; }
  private trace(operationId: string, message: string) { this.port.send({ type: 'trace', operationId, message }); }
  private emit(event: RuntimeEvent) { this.port.send(event); }
  private persist() { this.store?.save(this.state); }
  private route(target: string) { return `/${target.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9./_-]/g, '').replace(/\/+$/, '') || 'home'}`; }
}
