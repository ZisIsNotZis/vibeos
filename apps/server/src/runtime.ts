import type { AgentResult, AgentTask, AppRecord, Intent, Operation, RuntimeEvent, RuntimeSnapshot, Surface, WindowModel, RuntimeIntent, VibeOSSettings } from '@vibeos/shared';
import { log, recentLog } from './logging.js';
import { loadWorld } from './world-loader.js';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { worldRoot } from './paths.js';
export interface AgentAdapter { fulfill(task: AgentTask): Promise<AgentResult>; }
export interface RuntimePort { send(event: RuntimeEvent): void; }
export interface WorldStore { load(): RuntimeSnapshot; save(snapshot: RuntimeSnapshot): void; }
export const defaultSettings: VibeOSSettings = { effort: 'quality', search: 'none', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } };
function normalizeSettings(value: Partial<VibeOSSettings> | undefined): VibeOSSettings {
  const appearance = value?.appearance;
  return {
    effort: ['ultrafast', 'fast', 'balanced', 'quality', 'research'].includes(value?.effort ?? '') ? value!.effort! : defaultSettings.effort,
    search: ['none', 'online_info', 'online_content'].includes(value?.search ?? '') ? value!.search! : defaultSettings.search,
    appearance: {
      mode: appearance?.mode === 'light' || appearance?.mode === 'dark' ? appearance.mode : defaultSettings.appearance.mode,
      backgroundMode: appearance?.backgroundMode === 'stretch' || appearance?.backgroundMode === 'fill' || appearance?.backgroundMode === 'pad' ? appearance.backgroundMode : defaultSettings.appearance.backgroundMode,
      autoHideChromeOnMaximize: typeof appearance?.autoHideChromeOnMaximize === 'boolean' ? appearance.autoHideChromeOnMaximize : defaultSettings.appearance.autoHideChromeOnMaximize,
      dockPosition: appearance?.dockPosition === 'left' || appearance?.dockPosition === 'bottom' ? appearance.dockPosition : defaultSettings.appearance.dockPosition,
      ...(typeof appearance?.backgroundImage === 'string' && appearance.backgroundImage.startsWith('data:image/') ? { backgroundImage: appearance.backgroundImage } : {})
    }
  };
}
const world = loadWorld(worldRoot);
const seedApps: AppRecord[] = world.apps.length ? world.apps : [{ id: 'assistant', name: 'Assistant', description: 'Repair and shape your VibeOS world', icon: 'icon.svg', category: 'System', installed: true, status: 'available' }];
const seedSurfaces: Surface[] = world.surfaces;
function readWorldNode(appRoot: string) { return existsSync(join(appRoot, 'node.json')); }
export class OperatingSystemRuntime {
  private state: RuntimeSnapshot; private sequence = 0; private readonly inflight = new Map<string, Promise<void>>();
  constructor(private readonly agent: AgentAdapter, private readonly port: RuntimePort, private readonly store?: WorldStore) { const loaded = store?.load(); const duplicate = (id: string) => /^app-tetris-\d+$/.test(id); const loadedApps = loaded?.apps?.filter(app => !duplicate(app.id)); const apps = loadedApps?.length ? loadedApps.map(app => { const worldApp = seedApps.find(candidate => candidate.id === app.id); return worldApp?.icon?.endsWith('.svg') ? { ...app, icon: worldApp.icon, name: worldApp.name } : app; }) : seedApps; const cached = [...seedSurfaces, ...loadWorld(worldRoot).surfaces]; const surfaceMap = new Map(cached.map(surface => [`${surface.appId}:${surface.route}`, surface])); const surfaces = loaded?.surfaces?.filter(surface => !duplicate(surface.appId)).map(surface => surfaceMap.get(`${surface.appId}:${surface.route}`) ?? surface) ?? cached; this.state = loaded ? { ...loaded, apps, windows: loaded.windows?.filter(window => !duplicate(window.appId)) ?? [], surfaces, settings: normalizeSettings(loaded.settings) } : { windows: [], operations: [], notifications: [], apps: seedApps, surfaces: cached, settings: structuredClone(defaultSettings) }; this.persist(); }
  snapshot() { return structuredClone(this.state); }
  async dispatch(intent: RuntimeIntent): Promise<Operation> {
    const operation: Operation = { id: `op-${++this.sequence}`, intent, state: 'pending' }; this.state.operations.push(operation); this.trace(operation.id, `accepted ${intent.type}`); this.emit({ type: 'operation', operation });
    try {
      switch (intent.type) {
        case 'assistant_request': await this.assistant(operation.id, intent); break;
        case 'open_app': { const window = this.openApp(intent.appId); await this.ensureSurface(intent.appId, '/', window.id, { source: intent }); break; }
        case 'open_surface': { const window = this.openOrNavigateApp(intent.appId, intent.route); await this.ensureSurface(intent.appId, intent.route, window.id, { source: intent }); break; }
        case 'navigate': { const route = this.route(intent.target); const window = this.openOrNavigateApp('browser', route); await this.ensureSurface('browser', route, window.id, { source: intent, address: intent.target }); break; }
        case 'install_app': await this.install(operation.id, intent.app); break;
        case 'close_window': this.state.windows = this.state.windows.filter(window => window.id !== intent.windowId); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); break;
        case 'focus_window': this.focus(intent.windowId); break;
        case 'minimize_window': this.changeWindow(intent.windowId, 'minimized'); break;
        case 'maximize_window': this.toggleMaximize(intent.windowId); break;
        case 'move_window': this.moveWindow(intent.windowId, intent.x, intent.y); break;
        case 'resize_window': this.resizeWindow(intent.windowId, intent.width, intent.height); break;
        case 'activate_control': { const window = this.state.windows.find(item => item.appId === intent.appId && item.focused); const surface = this.state.surfaces.find(item => item.id === intent.surfaceId); const control = surface?.content.controls.find(item => item.id === intent.controlId); if (!control) throw new Error('The selected control is no longer available.'); if (control.action.type === 'activate_control') { this.trace(operation.id, `control ${intent.controlId} acknowledged`); break; } await this.dispatch(this.interpolate(control.action, (intent.input ?? {}) as Record<string, unknown>)); break; }
        case 'navigate_browser': { const appId = intent.appId ?? 'browser'; const route = this.route(intent.url); const window = this.openOrNavigateApp(appId, route); await this.ensureSurface(appId, route, window.id, { source: intent, address: intent.url }); break; }
        case 'open_file': case 'create_file': { const result = await this.agent.fulfill({ operationId: operation.id, capability: intent.type, intent, input: intent, target: `cache/files/${intent.type}` }); if (!result.ok) throw new Error(result.message); break; }
        case 'search_apps': break;
        case 'storage_read': this.readStorage(intent.appId, intent.key); break;
        case 'storage_write': this.writeStorage(intent.appId, intent.key, intent.value); break;
        case 'set_setting': this.setSetting(intent.key, intent.value); break;
        case 'set_appearance': this.setAppearance(intent.key, intent.value); break;
        case 'run_action': await this.runAction(intent); break;
      }
      return this.finish(operation);
    } catch (cause) { return this.fail(operation, cause instanceof Error ? cause.message : 'The operation could not be completed.'); }
  }
  private async assistant(operationId: string, intent: Extract<RuntimeIntent, { type: 'assistant_request' }>) {
    const context = { ...intent.context, recentOperations: this.state.operations.slice(-8).map(item => `${item.intent.type}:${item.state}`), recentLog: recentLog() };
    this.trace(operationId, 'Assistant is preparing a repair');
    const result = await this.agent.fulfill({ operationId, capability: 'assistant:repair', intent, input: { message: intent.message, context }, target: 'world', context: { settings: this.state.settings } });
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
  private async ensureSurface(appId: string, route: string, windowId?: string, input?: unknown) { const key = `${appId}:${route}`; const current = this.state.surfaces.find(surface => surface.appId === appId && surface.route === route); if (current?.status === 'ready') { if (windowId) this.updateWindowRoute(windowId, route); this.trace(`surface:${appId}:${route}`, 'cache hit'); return; } const existing = this.inflight.get(key); if (existing) { if (windowId) this.updateWindowRoute(windowId, route); await existing; return; } const work = this.generateSurface(appId, route, windowId, input); this.inflight.set(key, work); try { await work; } finally { this.inflight.delete(key); } }
  private async generateSurface(appId: string, route: string, windowId?: string, input?: unknown) { const current = this.state.surfaces.find(surface => surface.appId === appId && surface.route === route); if (current?.status === 'ready') return; const surface: Surface = current ?? { id: `surface-${++this.sequence}`, appId, route, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, status: 'generating', content: { heading: 'Loading', body: 'Please wait.', controls: [] } }; if (!current) this.state.surfaces.push(surface); if (windowId) this.updateWindowRoute(windowId, route); this.trace(`surface:${appId}:${route}`, 'generation requested'); this.emit({ type: 'surface', surface }); const result = await this.agent.fulfill({ operationId: `surface-${surface.id}`, capability: `surface:${appId}:${route}`, intent: { type: 'open_surface', appId, route }, input: { appId, route, original: input }, target: join(worldRoot, 'apps', appId), context: { ...this.generationContext(appId, route), settings: this.state.settings } }); if (!result.ok) throw new Error(result.message); const refreshed = loadWorld(worldRoot); const generated = refreshed.surfaces.find(item => item.appId === appId && item.route === route); if (!generated && existsSync(join(worldRoot, 'apps', appId, 'node.json'))) throw new Error(`Generated surface artifact was not found for ${appId} ${route}.`); const generatedApp = refreshed.apps.find(app => app.id === appId); const app = this.state.apps.find(item => item.id === appId); if (app && generatedApp?.icon) app.icon = generatedApp.icon; if (app && generated) app.status = 'available'; surface.status = 'ready'; surface.content = generated?.content ?? surface.content; surface.entry = generated?.entry; this.trace(`surface:${appId}:${route}`, 'ready'); this.emit({ type: 'surface', surface }); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private async install(operationId: string, app: AppRecord | import('@vibeos/shared').AppSpec) { log('runtime', 'installing app', app); const existing = this.state.apps.find(item => item.id === app.id); if (existing) { existing.installed = true; existing.status = 'placeholder'; } else { this.state.apps.push({ ...app, status: 'placeholder', installed: true }); } this.emit({ type: 'snapshot', snapshot: this.snapshot() }); const result = await this.agent.fulfill({ operationId, capability: 'app:identity', intent: { type: 'install_app', app }, input: app, target: join(worldRoot, 'apps', app.id), context: { acceptance: ['stable node identity', 'valid app-specific icon.svg', 'placeholder remains launchable'] } }); if (!result.ok) throw new Error(result.message); const appRoot = join(worldRoot, 'apps', app.id); if (!readWorldNode(appRoot)) { mkdirSync(appRoot, { recursive: true }); writeFileSync(join(appRoot, 'node.json'), JSON.stringify({ id: app.id, title: app.name, kind: 'app', status: 'placeholder', icon: app.icon, children: [] }, null, 2) + '\n'); } const generated = loadWorld(worldRoot).apps.find(item => item.id === app.id); const stateApp = this.state.apps.find(item => item.id === app.id); if (generated && stateApp) { stateApp.icon = generated.icon; stateApp.name = generated.name; } this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private openApp(appId: string, route = '/') { const existing = this.state.windows.find(window => window.appId === appId); if (existing) { this.state.windows = this.state.windows.map(window => window.id === existing.id ? { ...window, focused: true, state: 'normal', route: route === '/' ? window.route : route } : { ...window, focused: false }); const restored = this.state.windows.find(window => window.id === existing.id)!; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); return restored; } this.state.windows = this.state.windows.map(window => ({ ...window, focused: false })); const window: WindowModel = { id: `window-${++this.sequence}`, appId, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, route, state: 'normal', focused: true, position: { x: 120 + (this.sequence % 4) * 28, y: 72 + (this.sequence % 4) * 24 }, size: { width: 760, height: 500 } }; this.state.windows.push(window); this.emit({ type: 'window', window }); return window; }
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
  private route(target: string) {
    const raw = target.trim();
    if (!raw) return '/home';
    // Preserve a search request as a stable local route. Query text is data,
    // not a filesystem path, so encode it into the route key rather than
    // silently deleting spaces and producing a different page.
    const normalized = (raw.includes('://') ? raw.replace(/^https?:\/\//, '') : raw).replace(/^\/+/, '');
    const clean = normalized.replace(/\s+/g, '').replace(/[^\p{L}\p{N}.:/?=&_%+~#-]/gu, '').replace(/\/+$/, '');
    return `/${clean || 'home'}`;
  }
  private generationContext(appId: string, route: string) { const index = loadWorld(worldRoot); const node = index.nodes.find(item => item.id === appId); let existingFiles: string[] = []; try { existingFiles = readdirSync(join(worldRoot, 'apps', appId), { recursive: true, encoding: 'utf8' }).slice(0, 80); } catch {} return { node, siblings: index.nodes.filter(item => item.parentId === appId).map(item => ({ id: item.id, title: item.title, route: item.route, kind: item.kind })), existingFiles, acceptance: [`exact route ${route} is loadable`, 'primary user action is usable', 'no prose-only substitute', 'reuse exact cached route when present'] }; }
  private readStorage(appId: string, key: string) { const path = this.storagePath(appId, key); let value: unknown = null; try { value = JSON.parse(readFileSync(path, 'utf8')); } catch {} this.trace(`storage:${appId}:${key}`, 'read'); this.emit({ type: 'notification', message: JSON.stringify({ appId, key, value }) }); }
  private writeStorage(appId: string, key: string, value: unknown) { const path = this.storagePath(appId, key); mkdirSync(join(worldRoot, 'apps', appId, 'data'), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); this.trace(`storage:${appId}:${key}`, 'written'); }
  private setSetting(key: 'effort' | 'search', value: string) { if (key === 'effort' && ['ultrafast','fast','balanced','quality','research'].includes(value)) this.state.settings.effort = value as VibeOSSettings['effort']; else if (key === 'search' && ['none','online_info','online_content'].includes(value)) this.state.settings.search = value as VibeOSSettings['search']; else throw new Error('Invalid Settings value.'); log('runtime', 'settings updated', this.state.settings); this.persist(); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private setAppearance(key: 'mode' | 'backgroundMode' | 'backgroundImage' | 'autoHideChromeOnMaximize' | 'dockPosition', value: string | boolean | undefined) { if (key === 'mode' && (value === 'light' || value === 'dark')) this.state.settings.appearance.mode = value; else if (key === 'backgroundMode' && (value === 'stretch' || value === 'fill' || value === 'pad')) this.state.settings.appearance.backgroundMode = value; else if (key === 'backgroundImage' && (value === undefined || (typeof value === 'string' && value.startsWith('data:image/') && value.length <= 14_000_000))) this.state.settings.appearance.backgroundImage = value as string | undefined; else if (key === 'autoHideChromeOnMaximize' && typeof value === 'boolean') this.state.settings.appearance.autoHideChromeOnMaximize = value; else if (key === 'dockPosition' && (value === 'left' || value === 'bottom')) this.state.settings.appearance.dockPosition = value; else throw new Error('Invalid Appearance value.'); log('runtime', 'appearance updated', this.state.settings.appearance); this.persist(); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private storagePath(appId: string, key: string) { const safeApp = appId.replace(/[^a-zA-Z0-9_-]/g, ''); const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, ''); if (!safeApp || !safeKey) throw new Error('Invalid storage namespace.'); return join(worldRoot, 'apps', safeApp, 'data', `${safeKey}.json`); }
  private async runAction(intent: Extract<RuntimeIntent, { type: 'run_action' }>) {
    const surface = this.state.surfaces.find(item => item.id === intent.surfaceId);
    const action = surface?.content.controls.find(control => control.id === intent.action)?.action;
    if (!action) throw new Error(`Unknown generated action: ${intent.action}`);
    if (action.type === 'run_action' && action.action === intent.action) {
      const result = await this.agent.fulfill({ operationId: `action-${intent.surfaceId}-${intent.action}`, capability: `action:${intent.appId}:${intent.surfaceId}:${intent.action}`, intent, input: intent.input ?? {}, target: join(worldRoot, 'apps', intent.appId), context: this.generationContext(intent.appId, surface?.route ?? '/') });
      if (!result.ok) throw new Error(result.message);
      this.reloadWorld();
      return;
    }
    await this.dispatch(this.interpolate(action, intent.input ?? {}));
  }
  private interpolate<T extends RuntimeIntent>(intent: T, input: Record<string, unknown>): T {
    const copy = structuredClone(intent) as Record<string, unknown>;
    for (const key of Object.keys(copy)) if (typeof copy[key] === 'string') copy[key] = (copy[key] as string).replace(/\{([^}]+)\}/g, (_, name) => String(input[name] ?? ''));
    return copy as T;
  }
}
