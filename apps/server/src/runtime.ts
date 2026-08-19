import type { AgentResult, AgentTask, AppRecord, Intent, Operation, RuntimeEvent, RuntimeSnapshot, Surface, WindowModel } from '@vibeos/shared';
import { log } from './logging.js';
export interface AgentAdapter { fulfill(task: AgentTask): Promise<AgentResult>; }
export interface RuntimePort { send(event: RuntimeEvent): void; }
export interface WorldStore { load(): RuntimeSnapshot; save(snapshot: RuntimeSnapshot): void; }
const seedApps: AppRecord[] = [
  { id: 'browser', name: 'Browser', description: 'Explore imagined websites locally', icon: 'globe', category: 'System', installed: true, status: 'available' },
  { id: 'shop', name: 'App Shop', description: 'Find something new to imagine', icon: 'store', category: 'System', installed: true, status: 'available' },
  { id: 'calculator', name: 'Calculator', description: 'Perform quick calculations', icon: 'calculator', category: 'Productivity', installed: true, status: 'available' },
];
const seedSurfaces: Surface[] = [{
  id: 'surface-shop-root', appId: 'shop', route: '/', title: 'App Shop', status: 'ready',
  content: { heading: 'App Shop', body: 'Find something new to imagine.', controls: [], links: [] },
}, {
  id: 'surface-browser-root', appId: 'browser', route: '/', title: 'Browser', status: 'ready',
  content: { heading: 'Where to?', body: 'Imagine any website, locally.', controls: [], links: [] },
}, {
  id: 'surface-calculator-root', appId: 'calculator', route: '/', title: 'Calculator', status: 'ready',
  content: { heading: 'Calculator', body: 'Perform quick calculations.', controls: [], links: [] },
}];
export class OperatingSystemRuntime {
  private state: RuntimeSnapshot; private sequence = 0;
  constructor(private readonly agent: AgentAdapter, private readonly port: RuntimePort, private readonly store?: WorldStore) { this.state = store?.load() ?? { windows: [], operations: [], notifications: [], apps: seedApps, surfaces: seedSurfaces }; }
  snapshot() { return structuredClone(this.state); }
  async dispatch(intent: Intent): Promise<Operation> {
    const operation: Operation = { id: `op-${++this.sequence}`, intent, state: 'pending' }; this.state.operations.push(operation); this.trace(operation.id, `accepted ${intent.type}`); this.emit({ type: 'operation', operation });
    try {
      switch (intent.type) {
        case 'open_app': this.openApp(intent.appId); await this.ensureSurface(intent.appId, '/'); break;
        case 'open_surface': this.openApp(intent.appId); await this.ensureSurface(intent.appId, intent.route); break;
        case 'navigate': this.openApp('browser'); await this.ensureSurface('browser', this.route(intent.target)); break;
        case 'install_app': this.install(intent.app); break;
        case 'close_window': this.state.windows = this.state.windows.filter(window => window.id !== intent.windowId); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); break;
        case 'focus_window': this.focus(intent.windowId); break;
        case 'minimize_window': this.changeWindow(intent.windowId, 'minimized'); break;
        case 'maximize_window': this.changeWindow(intent.windowId, 'maximized'); break;
        case 'activate_control': await this.ensureSurface(intent.appId, `${intent.surfaceId}/${intent.controlId}`); break;
        case 'navigate_browser': this.openApp('browser'); await this.ensureSurface('browser', this.route(intent.url)); break;
        case 'open_file': case 'create_file': { const result = await this.agent.fulfill({ operationId: operation.id, capability: intent.type, intent, input: intent, target: `cache/files/${intent.type}` }); if (!result.ok) throw new Error(result.message); break; }
        case 'search_apps': break;
      }
      return this.finish(operation);
    } catch (cause) { return this.fail(operation, cause instanceof Error ? cause.message : 'The operation could not be completed.'); }
  }
  private async ensureSurface(appId: string, route: string) { const current = this.state.surfaces.find(surface => surface.appId === appId && surface.route === route); if (current?.status === 'ready') { this.trace(`surface:${appId}:${route}`, 'cache hit'); return; } const surface: Surface = current ?? { id: `surface-${++this.sequence}`, appId, route, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, status: 'generating', content: { heading: 'Preparing your space', body: 'This place is taking shape.', controls: [] } }; if (!current) this.state.surfaces.push(surface); this.trace(`surface:${appId}:${route}`, 'generation requested'); this.emit({ type: 'surface', surface }); const result = await this.agent.fulfill({ operationId: `surface-${surface.id}`, capability: `surface:${appId}:${route}`, intent: { type: 'open_surface', appId, route }, input: { appId, route }, target: `cache/apps/${appId}/surfaces/${surface.id}` }); if (!result.ok) throw new Error(result.message); surface.status = 'ready'; surface.content = { heading: surface.title, body: `A world imagined for ${surface.appId} at ${surface.route}.`, controls: [{ id: 'explore', kind: 'button', label: 'Explore further', action: { type: 'open_surface', appId, route: `${route}/explore` } }] }; this.trace(`surface:${appId}:${route}`, 'ready'); this.emit({ type: 'surface', surface }); }
  private install(app: AppRecord | import('@vibeos/shared').AppSpec) { log('runtime', 'installing app', app); if (!this.state.apps.some(existing => existing.id === app.id)) this.state.apps.push({ ...app, status: 'placeholder', installed: true }); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private openApp(appId: string) { this.state.windows = this.state.windows.map(window => ({ ...window, focused: false })); const window: WindowModel = { id: `window-${++this.sequence}`, appId, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, state: 'normal', focused: true }; this.state.windows.push(window); this.emit({ type: 'window', window }); }
  private focus(id: string) { this.state.windows = this.state.windows.map(window => ({ ...window, focused: window.id === id })); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private changeWindow(id: string, state: WindowModel['state']) { const window = this.state.windows.find(item => item.id === id); if (window) window.state = state; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private finish(operation: Operation) { operation.state = 'ready'; this.persist(); this.emit({ type: 'operation', operation }); return operation; }
  private fail(operation: Operation, message: string) { operation.state = 'failed'; operation.message = message; this.state.notifications.push(message); this.emit({ type: 'operation', operation }); this.emit({ type: 'notification', message }); return operation; }
  private trace(operationId: string, message: string) { this.port.send({ type: 'trace', operationId, message }); }
  private emit(event: RuntimeEvent) { this.port.send(event); }
  private persist() { this.store?.save(this.state); }
  private route(target: string) { return `/${target.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9./_-]/g, '').replace(/\/+$/, '') || 'home'}`; }
}
