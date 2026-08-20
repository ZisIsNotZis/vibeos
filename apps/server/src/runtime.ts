import type { AgentResult, AgentTask, AppRecord, Intent, Operation, RuntimeEvent, RuntimeSnapshot, Surface, WindowModel, RuntimeIntent, VibeOSSettings } from '@vibeos/shared';
import { log, recentLog } from './logging.js';
import { loadWorld } from './world-loader.js';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { worldRoot } from './paths.js';
import { patchAppState, readAppState, writeAppState } from './app-state.js';
import { spawn } from 'node:child_process';
export interface AgentAdapter { fulfill(task: AgentTask): Promise<AgentResult>; resume?(questionId: string, answer: string): Promise<AgentResult>; }
export interface RuntimePort { send(event: RuntimeEvent): void; requestWindowCapture?(target: { appId: string; windowId?: string }): Promise<{ path: string; capturedAt: string } | undefined>; }
export interface WorldStore { root?: string; load(): RuntimeSnapshot; save(snapshot: RuntimeSnapshot): void; }
export const defaultSettings: VibeOSSettings = { model: 'terra', useGhPrefix: false, reasoning: 'high', effort: 'quality', search: 'none', generationVisibility: 'completion', appearance: { mode: 'dark', backgroundMode: 'fill', autoHideChromeOnMaximize: false, dockPosition: 'bottom', uiTypeface: 'modern', monoTypeface: 'modern', displayScale: 'default' } };
const effortLevels: VibeOSSettings['effort'][] = ['fast', 'balanced', 'quality', 'ultra'];
const modelLevels = ['luna', 'terra', 'sol']; const reasoningLevels = ['none', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const appearanceModes: VibeOSSettings['appearance']['mode'][] = ['dark', 'light', 'desert'];
function normalizeSettings(value: Partial<VibeOSSettings> | undefined): VibeOSSettings {
  const appearance = value?.appearance;
  return {
    model: modelLevels.includes(value?.model ?? '') ? value!.model! : defaultSettings.model,
    useGhPrefix: typeof value?.useGhPrefix === 'boolean' ? value.useGhPrefix : defaultSettings.useGhPrefix,
    reasoning: reasoningLevels.includes(value?.reasoning ?? '') ? value!.reasoning! : defaultSettings.reasoning,
    effort: effortLevels.includes(value?.effort as VibeOSSettings['effort']) ? value!.effort! : defaultSettings.effort,
    search: ['none', 'online_info', 'online_content'].includes(value?.search ?? '') ? value!.search! : defaultSettings.search,
    generationVisibility: ['completion', 'messages', 'tools', 'reasoning'].includes(value?.generationVisibility ?? '') ? value!.generationVisibility! : defaultSettings.generationVisibility,
    appearance: {
      mode: appearanceModes.includes(appearance?.mode as VibeOSSettings['appearance']['mode']) ? appearance!.mode : defaultSettings.appearance.mode,
      backgroundMode: appearance?.backgroundMode === 'stretch' || appearance?.backgroundMode === 'fill' || appearance?.backgroundMode === 'pad' ? appearance.backgroundMode : defaultSettings.appearance.backgroundMode,
      autoHideChromeOnMaximize: typeof appearance?.autoHideChromeOnMaximize === 'boolean' ? appearance.autoHideChromeOnMaximize : defaultSettings.appearance.autoHideChromeOnMaximize,
      dockPosition: appearance?.dockPosition === 'left' || appearance?.dockPosition === 'bottom' ? appearance.dockPosition : defaultSettings.appearance.dockPosition,
      uiTypeface: appearance?.uiTypeface === 'modern' || appearance?.uiTypeface === 'system' || appearance?.uiTypeface === 'accessible' ? appearance.uiTypeface : defaultSettings.appearance.uiTypeface,
      monoTypeface: appearance?.monoTypeface === 'modern' || appearance?.monoTypeface === 'system' || appearance?.monoTypeface === 'accessible' ? appearance.monoTypeface : defaultSettings.appearance.monoTypeface,
      displayScale: appearance?.displayScale === 'compact' || appearance?.displayScale === 'default' || appearance?.displayScale === 'comfortable' || appearance?.displayScale === 'large' || appearance?.displayScale === 'extra_large' ? appearance.displayScale : defaultSettings.appearance.displayScale,
      ...(Number.isInteger(appearance?.notificationDuration) && (appearance?.notificationDuration ?? 0) >= 10 && (appearance?.notificationDuration ?? 0) <= 60 ? { notificationDuration: appearance!.notificationDuration! } : {}),
      ...(typeof appearance?.backgroundImage === 'string' && appearance.backgroundImage.startsWith('data:image/') ? { backgroundImage: appearance.backgroundImage } : {})
    }
  };
}
const world = loadWorld(worldRoot);
const seedApps: AppRecord[] = world.apps.length ? world.apps : [{ id: 'assistant', name: 'Assistant', description: 'Repair and shape your VibeOS world', icon: 'icon.svg', category: 'System', installed: true, status: 'available' }];
const seedSurfaces: Surface[] = world.surfaces;
function readWorldNode(appRoot: string) { return existsSync(join(appRoot, 'node.json')); }
const operationHistoryLimit = 100;
function isTransientWindowIntent(intent: RuntimeIntent) { return intent.type === 'focus_window' || intent.type === 'move_window' || intent.type === 'resize_window'; }
function numericSuffix(id: string | undefined) { const match = id?.match(/-(\d+)$/); return match ? Number(match[1]) : 0; }
export class OperatingSystemRuntime {
  private state: RuntimeSnapshot; private sequence = 0; private readonly inflight = new Map<string, Promise<void>>();
  private readonly pendingQuestions = new Map<string, { appId: string; title: string }>();
  constructor(private readonly agent: AgentAdapter, private readonly port: RuntimePort, private readonly store?: WorldStore) { const loaded = store?.load(); const duplicate = (id: string) => /^app-tetris-\d+$/.test(id); const loadedApps = loaded?.apps?.filter(app => !duplicate(app.id)); const apps = loadedApps?.length ? loadedApps.map(app => { const worldApp = seedApps.find(candidate => candidate.id === app.id); return worldApp?.icon?.endsWith('.svg') ? { ...app, icon: worldApp.icon, name: worldApp.name } : app; }) : seedApps; const cached = [...seedSurfaces, ...loadWorld(worldRoot).surfaces]; const surfaceMap = new Map(cached.map(surface => [`${surface.appId}:${surface.route}`, surface])); for (const surface of loaded?.surfaces?.filter(surface => !duplicate(surface.appId)) ?? []) { const key = `${surface.appId}:${surface.route}`; if (!surfaceMap.has(key)) surfaceMap.set(key, surface); } const surfaces = [...surfaceMap.values()]; const operations = (loaded?.operations ?? []).map(operation => operation.state === 'pending' ? { ...operation, state: 'cancelled' as const, message: 'Interrupted when VibeOS stopped.' } : operation).slice(-operationHistoryLimit); this.state = loaded ? { ...loaded, apps, windows: loaded.windows?.filter(window => !duplicate(window.appId)) ?? [], operations, surfaces, settings: normalizeSettings(loaded.settings) } : { windows: [], operations: [], notifications: [], apps: seedApps, surfaces: cached, settings: structuredClone(defaultSettings) }; this.sequence = Math.max(0, ...this.state.operations.map(operation => numericSuffix(operation.id)), ...this.state.windows.map(window => numericSuffix(window.id)), ...this.state.surfaces.map(surface => numericSuffix(surface.id))); this.persist(); }
  snapshot() { return structuredClone(this.state); }
  async dispatch(intent: RuntimeIntent): Promise<Operation> {
    if (isTransientWindowIntent(intent)) return this.dispatchTransient(intent);
    const operation: Operation = { id: `op-${++this.sequence}`, intent, state: 'pending' }; this.state.operations.push(operation); this.trace(operation.id, `accepted ${intent.type}`); this.emit({ type: 'operation', operation });
    try {
      switch (intent.type) {
        case 'answer_agent_question': await this.answerQuestion(intent.questionId, intent.answer); break;
        case 'assistant_request': await this.assistant(operation.id, intent); break;
        case 'bridge_request': await this.bridge(intent); break;
        case 'open_app': { const window = this.openApp(intent.appId); await this.ensureSurface(intent.appId, '/', window.id, { source: intent }); break; }
        case 'open_surface': { const window = this.openOrNavigateApp(intent.appId, intent.route); await this.ensureSurface(intent.appId, intent.route, window.id, { source: intent }); break; }
        case 'navigate': { const route = this.route(intent.target); const window = this.openOrNavigateApp('browser', route); await this.ensureSurface('browser', route, window.id, { source: intent, address: intent.target }); break; }
        case 'install_app': await this.install(operation.id, intent.app); break;
        case 'uninstall_app': this.uninstall(intent.appId); break;
        case 'close_window': this.state.windows = this.state.windows.filter(window => window.id !== intent.windowId); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); break;
        case 'minimize_window': this.changeWindow(intent.windowId, 'minimized'); break;
        case 'maximize_window': this.toggleMaximize(intent.windowId); break;
        case 'restore_and_move_window': this.restoreAndMove(intent.windowId, intent.x, intent.y); break;
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
  private async dispatchTransient(intent: Extract<RuntimeIntent, { type: 'focus_window' | 'move_window' | 'resize_window' }>): Promise<Operation> {
    if (intent.type === 'focus_window') this.focus(intent.windowId);
    else if (intent.type === 'move_window') this.moveWindow(intent.windowId, intent.x, intent.y);
    else this.resizeWindow(intent.windowId, intent.width, intent.height);
    this.persist();
    return { id: `ui-${++this.sequence}`, intent, state: 'ready' };
  }
  private async assistant(operationId: string, intent: Extract<RuntimeIntent, { type: 'assistant_request' }>) {
    const context = { ...intent.context, recentOperations: this.state.operations.slice(-8).map(item => `${item.intent.type}:${item.state}`), recentLog: recentLog() };
    this.trace(operationId, 'Assistant is preparing a repair');
    const selectedWindow = intent.context?.windowId ? this.state.windows.find(item => item.id === intent.context?.windowId) : this.state.windows.find(item => item.focused && item.appId !== 'assistant');
    const appId = intent.context?.nodeId ?? selectedWindow?.appId;
    if (!appId) throw new Error('Open or identify the application that should be repaired.');
    const result = await this.agent.fulfill({ operationId, capability: `repair:${appId}`, intent, input: { message: intent.message, context }, target: join(worldRoot, 'apps', appId), context: { ...this.generationContext(appId, selectedWindow?.route ?? '/'), settings: this.state.settings } });
    if (!result.ok) throw new Error(result.message);
    if (this.holdQuestion(result, appId, `Assistant — ${this.appTitle(appId)}`)) return;
    this.trace(operationId, 'Assistant repair handed back to VibeOS');
    this.reloadWorld([appId]);
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
  private focus(id: string) {
    if (this.state.windows.find(window => window.id === id)?.focused) return;
    this.state.windows = this.state.windows.map(window => ({ ...window, focused: window.id === id }));
    this.emit({ type: 'snapshot', snapshot: this.snapshot() });
  }
  private changeWindow(id: string, state: WindowModel['state']) { const window = this.state.windows.find(item => item.id === id); if (window) window.state = state; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private toggleMaximize(id: string) { const window = this.state.windows.find(item => item.id === id); if (window) window.state = window.state === 'maximized' ? 'normal' : 'maximized'; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private restoreAndMove(id: string, x: number, y: number) { const window = this.state.windows.find(item => item.id === id); if (!window) return; window.state = 'normal'; window.position = { x: Math.max(0, x), y: Math.max(42, y) }; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private moveWindow(id: string, x: number, y: number) { const window = this.state.windows.find(item => item.id === id); if (window) window.position = { x: Math.max(0, x), y: Math.max(42, y) }; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private resizeWindow(id: string, width: number, height: number) { const window = this.state.windows.find(item => item.id === id); if (window) window.size = { width: Math.max(360, width), height: Math.max(260, height) }; this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private finish(operation: Operation) { operation.state = 'ready'; this.compactOperations(); this.persist(); this.emit({ type: 'operation', operation }); return operation; }
  private fail(operation: Operation, message: string) { operation.state = 'failed'; operation.message = message; this.compactOperations(); this.persist(); this.state.notifications.push(message); this.emit({ type: 'operation', operation }); this.emit({ type: 'notification', message }); return operation; }
  private compactOperations() { if (this.state.operations.length > operationHistoryLimit) this.state.operations = this.state.operations.slice(-operationHistoryLimit); }
  private trace(operationId: string, message: string) { this.port.send({ type: 'trace', operationId, message }); }
  reportTask(taskId: string, title: string, kind: Extract<import('@vibeos/shared').TaskTraceKind, 'begin' | 'message' | 'tool_call' | 'reason'>, text: string) { this.emit({ type: 'task_trace', taskId, title, kind, text, status: 'active' }); }
  completeTask(taskId: string, title: string, message: string, ok: boolean) { this.emit({ type: 'task_trace', taskId, title, kind: 'end', text: message, status: ok ? 'success' : 'error' }); }
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
    const requestLimit = intent.operation.type === 'ai.command' || intent.operation.type === 'storage.write' ? 12 * 1024 * 1024 : 64 * 1024;
    if (Buffer.byteLength(JSON.stringify(intent.operation)) > requestLimit) throw new Error('Bridge request is too large.');
    try {
      let value: unknown; const operation = intent.operation;
      if (operation.type === 'notify') value = this.notify(operation.message, operation.level, operation.timeoutMs);
      else if (operation.type === 'state.read') value = readAppState(this.stateRoot(), intent.appId);
      else if (operation.type === 'state.write') { const next = writeAppState(this.stateRoot(), intent.appId, operation.state, operation.revision); this.emit({ type: 'state_changed', ...next }); value = next; }
      else if (operation.type === 'storage.read') value = this.readStorage(intent.appId, operation.key);
      else if (operation.type === 'storage.write') { this.writeStorage(intent.appId, operation.key, operation.value); value = true; }
      else if (operation.type === 'navigate') value = await this.dispatch({ type: 'navigate_browser', appId: intent.appId, url: operation.url, mode: operation.mode });
      else if (operation.type === 'ai.command') value = await this.aiCommand(intent.appId, operation);
      else if (operation.type === 'process.run') value = await this.runProcess(intent.appId, operation);
      else { this.assertBridgeIntent(intent.appId, operation.intent); value = await this.dispatch(operation.intent); }
      this.emit({ type: 'bridge_result', requestId: intent.requestId, ok: true, value });
    } catch (cause) { const error = cause instanceof Error ? cause.message : 'Bridge operation failed.'; this.emit({ type: 'bridge_result', requestId: intent.requestId, ok: false, error }); throw cause; }
  }
  private notify(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info', timeoutMs = (this.state.settings.appearance.notificationDuration ?? 20) * 1000) {
    const text = message.trim();
    if (!text || text.length > 500) throw new Error('Notification message must be between 1 and 500 characters.');
    const duration = Math.max(1000, Math.min(15_000, Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : 3500));
    this.state.notifications.push(text); this.state.notifications = this.state.notifications.slice(-20);
    this.persist(); this.emit({ type: 'notification', message: text, level, timeoutMs: duration });
    return { message: text, level, timeoutMs: duration };
  }
  private async aiCommand(appId: string, request: Extract<import('@vibeos/shared').BridgeOperation, { type: 'ai.command' }>) {
    if (!request.command.trim()) throw new Error('AI command cannot be empty.');
    const scope = request.scope ?? 'app'; const index = loadWorld(worldRoot); const targetApp = typeof scope === 'object' ? scope.appId : appId;
    if (typeof scope === 'object' && !index.nodes.some(node => node.id === targetApp)) throw new Error('AI command target app does not exist.');
    const targets = scope === 'world' ? index.nodes.filter(node => node.kind === 'app').map(node => node.id) : scope === 'descendants' ? descendants(index.nodes, appId) : [targetApp];
    const changedApps: string[] = []; let result: AgentResult | undefined;
    for (const target of targets) {
      const appState = readAppState(this.stateRoot(), target);
      const window = this.state.windows.find(item => item.appId === target && (item.focused || target === appId)); const captured = this.takeSubmittedWindowCapture(request.context, target, window?.id);
      const safeContext = request.context && typeof request.context === 'object' ? Object.fromEntries(Object.entries(request.context as Record<string, unknown>).filter(([key]) => key !== '__vibeosWindowScreenshot')) : request.context;
      result = await this.agent.fulfill({ operationId: `ai-${appId}-${Date.now()}-${target}`, capability: `ai:command:${appId}`, intent: { type: 'assistant_request', message: request.command, context: { nodeId: target } }, input: { command: request.command, scope, context: safeContext, state: appState, world: index.apps.map(app => ({ id: app.id, name: app.name, revision: readAppState(this.stateRoot(), app.id).revision })), output: request.output }, target: join(worldRoot, 'apps', target), context: { ...this.generationContext(target, '/'), settings: this.state.settings, acceptance: ['complete the command or create an explicit deferred action'], ...(captured ? { observation: { kind: 'window-screenshot' as const, appId: target, windowId: window?.id, path: captured, capturedAt: new Date().toISOString() } } : {}) } });
      if (!result.ok) throw new Error(result.message); changedApps.push(target);
      if (this.holdQuestion(result, target, `${this.appTitle(target)} — Command`)) return { status: 'deferred', summary: result.result?.summary ?? 'Waiting for your answer.' };
      for (const mutation of result.result?.statePatches ?? []) {
        if (!index.apps.some(app => app.id === mutation.appId)) throw new Error('AI command returned a state patch for an unknown app.');
        const next = patchAppState(this.stateRoot(), mutation.appId, mutation.patch, mutation.revision); this.emit({ type: 'state_changed', ...next });
        if (!changedApps.includes(mutation.appId)) changedApps.push(mutation.appId);
      }
    }
    if (!result?.ok) throw new Error('AI command produced no result.');
    this.reloadWorld(changedApps);
    return { status: result.result?.status === 'deferred' ? 'deferred' : 'completed', summary: result.result?.summary ?? 'Command completed.', changedApps, routes: result.result?.routes, value: result.result?.value };
  }
  private holdQuestion(result: AgentResult, appId: string, title: string) {
    if (!result.ok || result.result?.status !== 'needs_input' || !result.result.question || !result.result.questionId) return false;
    this.pendingQuestions.set(result.result.questionId, { appId, title });
    this.emit({ type: 'agent_question', questionId: result.result.questionId, title, question: result.result.question });
    return true;
  }
  private async answerQuestion(questionId: string, answer: string) {
    if (!/^[a-zA-Z0-9_-]{8,160}$/.test(questionId)) throw new Error('Invalid question identifier.');
    if (typeof answer !== 'string' || answer.length > 16_000) throw new Error('Answer is too large.');
    const pending = this.pendingQuestions.get(questionId); if (!pending) throw new Error('That question is no longer waiting for an answer.');
    if (!this.agent.resume) throw new Error('This generation worker cannot resume questions.');
    const result = await this.agent.resume(questionId, answer);
    if (!result.ok) throw new Error(result.message);
    this.pendingQuestions.delete(questionId);
    if (this.holdQuestion(result, pending.appId, pending.title)) return;
    for (const mutation of result.result?.statePatches ?? []) {
      const next = patchAppState(this.stateRoot(), mutation.appId, mutation.patch, mutation.revision); this.emit({ type: 'state_changed', ...next });
    }
    this.reloadWorld([pending.appId, ...(result.result?.changedApps ?? [])]);
  }
  private appTitle(appId: string) { return this.state.apps.find(app => app.id === appId)?.name ?? appId.replace(/^app-/, '').replace(/[-_]+/g, ' '); }
  private assertBridgeIntent(appId: string, intent: Exclude<RuntimeIntent, { type: 'bridge_request' }>) {
    const target = 'appId' in intent ? intent.appId : undefined;
    if (target !== undefined && target !== appId) throw new Error('Generated app cannot act as another app.');
    if (intent.type === 'storage_read' || intent.type === 'storage_write') throw new Error('Use bridge storage operations.');
  }
  private setSetting(key: 'model' | 'useGhPrefix' | 'reasoning' | 'effort' | 'search' | 'generationVisibility', value: string | boolean) { if (key === 'model' && typeof value === 'string' && modelLevels.includes(value)) this.state.settings.model = value as VibeOSSettings['model']; else if (key === 'useGhPrefix' && typeof value === 'boolean') this.state.settings.useGhPrefix = value; else if (key === 'reasoning' && typeof value === 'string' && reasoningLevels.includes(value)) this.state.settings.reasoning = value as VibeOSSettings['reasoning']; else if (key === 'effort' && typeof value === 'string' && effortLevels.includes(value as VibeOSSettings['effort'])) this.state.settings.effort = value as VibeOSSettings['effort']; else if (key === 'search' && typeof value === 'string' && ['none','online_info','online_content'].includes(value)) this.state.settings.search = value as VibeOSSettings['search']; else if (key === 'generationVisibility' && typeof value === 'string' && ['completion','messages','tools','reasoning'].includes(value)) this.state.settings.generationVisibility = value as VibeOSSettings['generationVisibility']; else throw new Error('Invalid Settings value.'); log('runtime', 'settings updated', this.state.settings); this.persist(); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private setAppearance(key: 'mode' | 'backgroundMode' | 'backgroundImage' | 'autoHideChromeOnMaximize' | 'dockPosition' | 'uiTypeface' | 'monoTypeface' | 'displayScale' | 'notificationDuration', value: string | boolean | number | undefined) { if (key === 'mode' && appearanceModes.includes(value as VibeOSSettings['appearance']['mode'])) this.state.settings.appearance.mode = value as VibeOSSettings['appearance']['mode']; else if (key === 'backgroundMode' && (value === 'stretch' || value === 'fill' || value === 'pad')) this.state.settings.appearance.backgroundMode = value; else if (key === 'backgroundImage' && (value === undefined || (typeof value === 'string' && value.startsWith('data:image/') && value.length <= 14_000_000))) this.state.settings.appearance.backgroundImage = value as string | undefined; else if (key === 'autoHideChromeOnMaximize' && typeof value === 'boolean') this.state.settings.appearance.autoHideChromeOnMaximize = value; else if (key === 'dockPosition' && (value === 'left' || value === 'bottom')) this.state.settings.appearance.dockPosition = value; else if (key === 'uiTypeface' && (value === 'modern' || value === 'system' || value === 'accessible')) this.state.settings.appearance.uiTypeface = value; else if (key === 'monoTypeface' && (value === 'modern' || value === 'system' || value === 'accessible')) this.state.settings.appearance.monoTypeface = value; else if (key === 'displayScale' && (value === 'compact' || value === 'default' || value === 'comfortable' || value === 'large' || value === 'extra_large')) this.state.settings.appearance.displayScale = value; else if (key === 'notificationDuration' && typeof value === 'number' && Number.isInteger(value) && value >= 10 && value <= 60) this.state.settings.appearance.notificationDuration = value; else throw new Error('Invalid Appearance value.'); log('runtime', 'appearance updated', this.state.settings.appearance); this.persist(); this.emit({ type: 'snapshot', snapshot: this.snapshot() }); }
  private runProcess(appId: string, operation: Extract<import('@vibeos/shared').BridgeOperation, { type: 'process.run' }>) {
    const executable = operation.program.trim();
    if (!['python', 'python3', 'node', 'deno', 'bun', 'ruby', 'php'].includes(executable) || executable.includes('/') || executable.includes('\\')) throw new Error('This runtime only permits approved language interpreters.');
    const root = join(worldRoot, 'apps', appId); const cwd = operation.cwd ? join(root, operation.cwd) : root;
    if (!cwd.startsWith(`${root}/`) && cwd !== root) throw new Error('Process working directory must stay inside the app workspace.');
    const timeout = Math.max(250, Math.min(30_000, Number.isFinite(operation.timeoutMs) ? Math.trunc(operation.timeoutMs!) : 10_000));
    return new Promise((resolve, reject) => { const child = spawn(executable, (operation.args ?? []).slice(0, 32).map(String), { cwd, shell: false, env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' } }); let stdout = '', stderr = '', settled = false; const timer = setTimeout(() => { child.kill('SIGTERM'); finish(reject, new Error('Process timed out.')); }, timeout); const finish = (fn: (v: unknown) => void, v: unknown) => { if (settled) return; settled = true; clearTimeout(timer); fn(v); }; child.stdout.on('data', x => { stdout = (stdout + x).slice(-256000); }); child.stderr.on('data', x => { stderr = (stderr + x).slice(-256000); }); child.on('error', e => finish(reject, e)); child.on('close', code => finish(resolve, { stdout, stderr, exitCode: code ?? 1 })); child.stdin.end(typeof operation.stdin === 'string' ? operation.stdin : undefined); });
  }
  private storagePath(appId: string, key: string) { const safeApp = appId.replace(/[^a-zA-Z0-9_-]/g, ''); const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, ''); if (!safeApp || !safeKey) throw new Error('Invalid storage namespace.'); return join(this.store?.root ?? worldRoot, 'apps', safeApp, 'data', `${safeKey}.json`); }
  private stateRoot() { return this.store?.root ?? worldRoot; }
  private takeSubmittedWindowCapture(context: unknown, appId: string, windowId?: string) { const data = context && typeof context === 'object' ? (context as Record<string, unknown>).__vibeosWindowScreenshot : undefined; if (typeof data !== 'string' || !data.startsWith('data:image/png;base64,')) return undefined; const encoded = data.slice('data:image/png;base64,'.length); const bytes = Buffer.from(encoded, 'base64'); if (!bytes.length || bytes.length > 8 * 1024 * 1024) return undefined; const root = join(tmpdir(), 'vibeos-captures'); mkdirSync(root, { recursive: true }); const path = join(root, `${Date.now()}-${appId}-${windowId ?? 'window'}.png`); writeFileSync(path, bytes); return path; }
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
