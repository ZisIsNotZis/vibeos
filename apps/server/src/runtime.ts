import type { AgentResult, AgentTask, AppRecord, Intent, Operation, RuntimeEvent, RuntimeSnapshot, Surface, WindowModel, RuntimeIntent, VibeOSSettings } from '@vibeos/shared';
import { log, recentLog } from './logging.js';
import { loadWorld } from './world-loader.js';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { worldRoot } from './paths.js';
export interface AgentAdapter { fulfill(task: AgentTask): Promise<AgentResult>; }
export interface RuntimePort { send(event: RuntimeEvent): void; }
export interface WorldStore { root?: string; load(): RuntimeSnapshot; save(snapshot: RuntimeSnapshot): void; }
export const defaultSettings: VibeOSSettings = { model: 'terra', reasoning: 'high', effort: 'quality', search: 'none', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom' } };
const effortLevels: VibeOSSettings['effort'][] = ['fast', 'balanced', 'quality', 'ultra'];
const modelLevels = ['luna', 'terra', 'sol']; const reasoningLevels = ['none', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
function normalizeSettings(value: Partial<VibeOSSettings> | undefined): VibeOSSettings {
  const appearance = value?.appearance;
  return {
    model: modelLevels.includes(value?.model ?? '') ? value!.model! : defaultSettings.model,
    reasoning: reasoningLevels.includes(value?.reasoning ?? '') ? value!.reasoning! : defaultSettings.reasoning,
    effort: effortLevels.includes(value?.effort as VibeOSSettings['effort']) ? value!.effort! : defaultSettings.effort,
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
  constructor(private readonly agent: AgentAdapter, private readonly port: RuntimePort, private readonly store?: WorldStore) { const loaded = store?.load(); const duplicate = (id: string) => /^app-tetris-\d+$/.test(id); const loadedApps = loaded?.apps?.filter(app => !duplicate(app.id)); const apps = loadedApps?.length ? loadedApps.map(app => { const worldApp = seedApps.find(candidate => candidate.id === app.id); return worldApp?.icon?.endsWith('.svg') ? { ...app, icon: worldApp.icon, name: worldApp.name } : app; }) : seedApps; const cached = [...seedSurfaces, ...loadWorld(worldRoot).surfaces]; const surfaceMap = new Map(cached.map(surface => [`${surface.appId}:${surface.route}`, surface])); for (const surface of loaded?.surfaces?.filter(surface => !duplicate(surface.appId)) ?? []) { const key = `${surface.appId}:${surface.route}`; if (!surfaceMap.has(key)) surfaceMap.set(key, surface); } const surfaces = [...surfaceMap.values()]; const operations = (loaded?.operations ?? []).map(operation => operation.state === 'pending' ? { ...operation, state: 'cancelled' as const, message: 'Interrupted when VibeOS stopped.' } : operation); this.state = loaded ? { ...loaded, apps, windows: loaded.windows?.filter(window => !duplicate(window.appId)) ?? [], operations, surfaces, settings: normalizeSettings(loaded.settings) } : { windows: [], operations: [], notifications: [], apps: seedApps, surfaces: cached, settings: structuredClone(defaultSettings) }; this.persist(); }
  snapshot() { return structuredClone(this.state); }
  async dispatch(intent: RuntimeIntent): Promise<Operation> {
    const operation: Operation = { id: `op-${++this.sequence}`, intent, state: 'pending' }; this.state.operations.push(operation); this.trace(operation.id, `accepted ${intent.type}`); this.emit({ type: 'operation', operation });
    try {
      switch (intent.type) {
        case 'assistant_request': await this.assistant(operation.id, intent); break;
        case 'bridge_request': await this.bridge(intent); break;
        case 'open_app': { const window = this.openApp(intent.appId); await this.ensureSurface(intent.appId, '/', window.id, { source: intent }); break; }
        case 'open_surface': { const window = this.openOrNavigateApp(intent.appId, intent.route); await this.ensureSurface(intent.appId, intent.route, window.id, { source: intent }); break; }
        case 'navigate': { const route = this.route(intent.target); const window = this.openOrNavigateApp('browser', route); await this.ensureSurface('browser', route, window.id, { source: intent, address: intent.target }); break; }
        case 'install_app': await this.install(operation.id, intent.app); break;
        case 'uninstall_app': this.uninstall(intent.appId); break;
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
    const selectedWindow = intent.context?.windowId ? this.state.windows.find(item => item.id === intent.context?.windowId) : this.state.windows.find(item => item.focused && item.appId !== 'assistant');
    const appId = intent.context?.nodeId ?? selectedWindow?.appId;
    if (!appId) throw new Error('Open or identify the application that should be repaired.');
    const result = await this.agent.fulfill({ operationId, capability: `repair:${appId}`, intent, input: { message: intent.message, context }, target: join(worldRoot, 'apps', appId), context: { ...this.generationContext(appId, selectedWindow?.route ?? '/'), settings: this.state.settings } });
    if (!result.ok) throw new Error(result.message);
    this.trace(operationId, 'Assistant repair handed back to VibeOS');
    this.reloadWorld();
  }
  private reloadWorld(changedApps?: string[]) {
    const next = loadWorld(worldRoot);
    this.state.apps = next.apps.length ? next.apps : this.state.apps;
    const changed = new Set(changedApps ?? []);
    this.state.surfaces = [...this.state.surfaces.filter(surface => surface.status !== 'ready' || !changed.has(surface.appId)), ...next.surfaces];
    if (changedApps?.length) this.emit({ type: 'world_changed', apps: changedApps });
    this.emit({ type: 'snapshot', snapshot: this.snapshot() });
  }
  private async ensureSurface(appId: string, route: string, windowId?: string, input?: unknown) { const key = `${appId}:${route}`; const current = this.state.surfaces.find(surface => surface.appId === appId && surface.route === route); if (current?.status === 'ready') { if (windowId) this.updateWindowRoute(windowId, route); this.trace(`surface:${appId}:${route}`, 'cache hit'); return; } const existing = this.inflight.get(key); if (existing) { if (windowId) this.updateWindowRoute(windowId, route); await existing; return; } const work = this.generateSurface(appId, route, windowId, input); this.inflight.set(key, work); try { await work; } finally { this.inflight.delete(key); } }
  private async generateSurface(appId: string, route: string, windowId?: string, input?: unknown) { const current = this.state.surfaces.find(surface => surface.appId === appId && surface.route === route); if (current?.status === 'ready') return; const surface: Surface = current ?? { id: `surface-${++this.sequence}`, appId, route, title: this.state.apps.find(app => app.id === appId)?.name ?? appId, status: 'generating', content: { heading: 'Loading', body: 'Please wait.', controls: [] } }; if (!current) this.state.surfaces.push(surface); if (windowId) this.updateWindowRoute(windowId, route); this.trace(`surface:${appId}:${route}`, 'generation requested'); this.emit({ type: 'surface', surface }); const result = await this.agent.fulfill({ operationId: `surface-${surface.id}`, capability: `surface:${appId}:${route}`, intent: { type: 'open_surface', appId, route }, input: { appId, route, original: input }, target: join(worldRoot, 'apps', appId), context: { ...this.generationContext(appId, route), settings: this.state.settings } }); if (!result.ok) throw new Error(result.message); const refreshed = loadWorld(worldRoot); const generated = refreshed.surfaces.find(item => item.appId === appId && item.route === route); if (!generated && existsSync(join(worldRoot, 'apps', appId, 'node.json'))) throw new Error(`Generated surface artifact was not found for ${appId} ${route}.`); const generatedApp = refreshed.apps.find(app => app.id === appId); const app = this.state.apps.find(item => item.id === appId); if (app && generatedApp?.icon) app.icon = generatedApp.icon; if (app && generated) app.status = 'available'; surface.status = 'ready'; surface.content = generated?.content ?? surface.content; surface.entry = generated?.entry; this.trace(`surface:${appId}:${route}`, 'ready'); this.emit({ type: 'surface', surface }); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private async install(operationId: string, app: AppRecord | import('@vibeos/shared').AppSpec) { log('runtime', 'installing app', app); const existing = this.state.apps.find(item => item.id === app.id); if (existing) { existing.installed = true; existing.status = 'placeholder'; } else { this.state.apps.push({ ...app, status: 'placeholder', installed: true }); } this.emit({ type: 'snapshot', snapshot: this.snapshot() }); const result = await this.agent.fulfill({ operationId, capability: 'app:identity', intent: { type: 'install_app', app }, input: app, target: join(worldRoot, 'apps', app.id), context: { acceptance: ['stable node identity', 'valid app-specific icon.svg', 'placeholder remains launchable'], settings: this.state.settings } }); if (!result.ok) throw new Error(result.message); const appRoot = join(worldRoot, 'apps', app.id); if (!readWorldNode(appRoot)) { mkdirSync(appRoot, { recursive: true }); writeFileSync(join(appRoot, 'node.json'), JSON.stringify({ id: app.id, title: app.name, kind: 'app', status: 'placeholder', icon: app.icon, children: [] }, null, 2) + '\n'); } const generated = loadWorld(worldRoot).apps.find(item => item.id === app.id); const stateApp = this.state.apps.find(item => item.id === app.id); if (generated && stateApp) { stateApp.icon = generated.icon; stateApp.name = generated.name; } this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private uninstall(appId: string) {
    if (new Set(['assistant', 'settings', 'shop', 'browser']).has(appId)) throw new Error('System applications cannot be deleted.');
    if (!/^[a-zA-Z0-9_-]+$/.test(appId)) throw new Error('Invalid application identifier.');
    this.state.windows = this.state.windows.filter(window => window.appId !== appId);
    this.state.surfaces = this.state.surfaces.filter(surface => surface.appId !== appId);
    this.state.apps = this.state.apps.filter(app => app.id !== appId);
    const appRoot = join(worldRoot, 'apps', appId); if (existsSync(appRoot)) rmSync(appRoot, { recursive: true, force: true });
    log('runtime', 'uninstalled app', { appId }); this.emit({ type: 'snapshot', snapshot: this.snapshot() });
  }
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
  private readStorage(appId: string, key: string) { const path = this.storagePath(appId, key); let value: unknown = null; try { value = JSON.parse(readFileSync(path, 'utf8')); } catch {} this.trace(`storage:${appId}:${key}`, 'read'); return value; }
  private writeStorage(appId: string, key: string, value: unknown) { const path = this.storagePath(appId, key); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); this.trace(`storage:${appId}:${key}`, 'written'); }
  private async bridge(intent: Extract<RuntimeIntent, { type: 'bridge_request' }>) {
    if (!/^[a-zA-Z0-9_-]{1,96}$/.test(intent.requestId)) throw new Error('Invalid bridge request identifier.');
    if (Buffer.byteLength(JSON.stringify(intent.operation)) > 64 * 1024) throw new Error('Bridge request is too large.');
    try {
      let value: unknown; const operation = intent.operation;
      if (operation.type === 'storage.read') value = this.readStorage(intent.appId, operation.key);
      else if (operation.type === 'storage.write') { this.writeStorage(intent.appId, operation.key, operation.value); value = true; }
      else if (operation.type === 'navigate') value = await this.dispatch({ type: 'navigate_browser', appId: intent.appId, url: operation.url, mode: operation.mode });
      else if (operation.type === 'ai.command') value = await this.aiCommand(intent.appId, operation);
      else { this.assertBridgeIntent(intent.appId, operation.intent); value = await this.dispatch(operation.intent); }
      this.emit({ type: 'bridge_result', requestId: intent.requestId, ok: true, value });
    } catch (cause) { const error = cause instanceof Error ? cause.message : 'Bridge operation failed.'; this.emit({ type: 'bridge_result', requestId: intent.requestId, ok: false, error }); throw cause; }
  }
  private async aiCommand(appId: string, request: Extract<import('@vibeos/shared').BridgeOperation, { type: 'ai.command' }>) {
    if (!request.command.trim()) throw new Error('AI command cannot be empty.');
    const scope = request.scope ?? 'app'; const index = loadWorld(worldRoot); const targetApp = typeof scope === 'object' ? scope.appId : appId;
    if (typeof scope === 'object' && !index.nodes.some(node => node.id === targetApp)) throw new Error('AI command target app does not exist.');
    const targets = scope === 'world' ? index.nodes.filter(node => node.kind === 'app').map(node => node.id) : scope === 'descendants' ? descendants(index.nodes, appId) : [targetApp];
    const changedApps: string[] = []; let result: AgentResult | undefined;
    for (const target of targets) {
      result = await this.agent.fulfill({ operationId: `ai-${appId}-${Date.now()}-${target}`, capability: `ai:command:${appId}`, intent: { type: 'assistant_request', message: request.command, context: { nodeId: target } }, input: { command: request.command, scope, context: request.context, output: request.output }, target: join(worldRoot, 'apps', target), context: { ...this.generationContext(target, '/'), settings: this.state.settings, acceptance: ['complete the command or create an explicit deferred action'] } });
      if (!result.ok) throw new Error(result.message); changedApps.push(target);
    }
    if (!result?.ok) throw new Error('AI command produced no result.');
    this.reloadWorld(changedApps);
    return { status: result.result?.status === 'deferred' ? 'deferred' : 'completed', summary: result.result?.summary ?? 'Command completed.', changedApps, routes: result.result?.routes, value: result.result?.value };
  }
  private assertBridgeIntent(appId: string, intent: Exclude<RuntimeIntent, { type: 'bridge_request' }>) {
    const target = 'appId' in intent ? intent.appId : undefined;
    if (target !== undefined && target !== appId) throw new Error('Generated app cannot act as another app.');
    if (intent.type === 'storage_read' || intent.type === 'storage_write') throw new Error('Use bridge storage operations.');
  }
  private setSetting(key: 'model' | 'reasoning' | 'effort' | 'search', value: string) { if (key === 'model' && modelLevels.includes(value)) this.state.settings.model = value as VibeOSSettings['model']; else if (key === 'reasoning' && reasoningLevels.includes(value)) this.state.settings.reasoning = value as VibeOSSettings['reasoning']; else if (key === 'effort' && effortLevels.includes(value as VibeOSSettings['effort'])) this.state.settings.effort = value as VibeOSSettings['effort']; else if (key === 'search' && ['none','online_info','online_content'].includes(value)) this.state.settings.search = value as VibeOSSettings['search']; else throw new Error('Invalid Settings value.'); log('runtime', 'settings updated', this.state.settings); this.persist(); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private setAppearance(key: 'mode' | 'backgroundMode' | 'backgroundImage' | 'autoHideChromeOnMaximize' | 'dockPosition', value: string | boolean | undefined) { if (key === 'mode' && (value === 'light' || value === 'dark')) this.state.settings.appearance.mode = value; else if (key === 'backgroundMode' && (value === 'stretch' || value === 'fill' || value === 'pad')) this.state.settings.appearance.backgroundMode = value; else if (key === 'backgroundImage' && (value === undefined || (typeof value === 'string' && value.startsWith('data:image/') && value.length <= 14_000_000))) this.state.settings.appearance.backgroundImage = value as string | undefined; else if (key === 'autoHideChromeOnMaximize' && typeof value === 'boolean') this.state.settings.appearance.autoHideChromeOnMaximize = value; else if (key === 'dockPosition' && (value === 'left' || value === 'bottom')) this.state.settings.appearance.dockPosition = value; else throw new Error('Invalid Appearance value.'); log('runtime', 'appearance updated', this.state.settings.appearance); this.persist(); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private storagePath(appId: string, key: string) { const safeApp = appId.replace(/[^a-zA-Z0-9_-]/g, ''); const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, ''); if (!safeApp || !safeKey) throw new Error('Invalid storage namespace.'); return join(this.store?.root ?? worldRoot, 'apps', safeApp, 'data', `${safeKey}.json`); }
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
function descendants(nodes: ReturnType<typeof loadWorld>['nodes'], root: string) { const found: string[] = []; const visit = (parent: string) => { for (const node of nodes.filter(item => item.parentId === parent && item.kind === 'app')) { found.push(node.id); visit(node.id); } }; visit(root); return found.length ? found : [root]; }
