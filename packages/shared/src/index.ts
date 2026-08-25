export type AppId = string;
export type WindowState = 'normal' | 'minimized' | 'maximized';
export type OperationState = 'pending' | 'ready' | 'failed' | 'cancelled';
export type SurfaceState = 'placeholder' | 'generating' | 'ready' | 'failed';
export type Intent =
  | { type: 'open_app'; appId: AppId }
  | { type: 'close_window'; windowId: string }
  | { type: 'focus_window'; windowId: string }
  | { type: 'minimize_window'; windowId: string }
  | { type: 'maximize_window'; windowId: string }
  | { type: 'restore_and_move_window'; windowId: string; x: number; y: number }
  | { type: 'move_window'; windowId: string; x: number; y: number }
  | { type: 'resize_window'; windowId: string; width: number; height: number }
  | { type: 'open_surface'; appId: AppId; route: string }
  | { type: 'navigate'; target: string }
  | { type: 'activate_control'; appId: AppId; surfaceId: string; controlId: string; input?: unknown }
  | { type: 'install_app'; app: AppSpec }
  | { type: 'uninstall_app'; appId: AppId }
  | { type: 'search_apps'; query: string }
  | { type: 'open_file'; path: string }
  | { type: 'create_file'; path: string; content?: string }
  | { type: 'navigate_browser'; url: string; appId?: AppId; mode?: 'search_results' | 'destination' }
  | { type: 'run_action'; appId: AppId; surfaceId: string; action: string; input?: Record<string, unknown> };
export type StorageIntent =
  | { type: 'storage_read'; appId: AppId; key: string }
  | { type: 'storage_write'; appId: AppId; key: string; value: unknown };
export type BridgeOperation =
  | { type: 'notify'; message: string; level?: 'info' | 'success' | 'warning' | 'error'; timeoutMs?: number }
  | { type: 'storage.read'; key: string }
  | { type: 'storage.write'; key: string; value: unknown }
  | { type: 'state.read' }
  | { type: 'state.write'; state: unknown; revision?: number }
  | { type: 'navigate'; url: string; mode?: 'search_results' | 'destination' }
  | { type: 'dispatch'; intent: Intent | SettingsIntent | AssistantIntent }
  | { type: 'ai.command'; command: string; scope?: AiScope; context?: unknown; output?: 'result' | 'modify' | 'navigate' | 'generate' }
  | { type: 'process.run'; program: string; args?: string[]; stdin?: string; cwd?: string; timeoutMs?: number };
export type AiScope = 'app' | 'descendants' | 'world' | { appId: AppId };
export type JsonPatchOperation = { op: 'add' | 'replace' | 'remove'; path: string; value?: unknown };
export type AppStateSnapshot = { appId: AppId; revision: number; state: unknown };
export type AiCommandResult = { status: 'completed' | 'deferred'; summary: string; changedApps?: AppId[]; routes?: string[]; value?: unknown };
export type BridgeIntent = { type: 'bridge_request'; requestId: string; appId: AppId; operation: BridgeOperation };
export type ModelLevel = 'luna' | 'terra' | 'sol';
export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
export type EffortLevel = 'fast' | 'balanced' | 'quality' | 'ultra';
export type SearchLevel = 'none' | 'online_info' | 'online_content';
export type GenerationVisibility = 'completion' | 'messages' | 'tools' | 'reasoning';
export type GenerationAccessLevel = 'off' | 'allowed' | 'recommended';
export type GenerationAccess = { knowledge: GenerationAccessLevel; assets: GenerationAccessLevel; code: GenerationAccessLevel; packages: GenerationAccessLevel };
/** Theme names are stable settings values. New themes only add semantic token sets. */
export type AppearanceMode = 'light' | 'dark' | 'desert';
export type BackgroundMode = 'stretch' | 'fill' | 'pad';
export type DockPosition = 'bottom' | 'left';
export type Typeface = 'modern' | 'system' | 'accessible';
export type DisplayScale = 'compact' | 'default' | 'comfortable' | 'large' | 'extra_large';
export type VibeOSSettings = {
  model: ModelLevel;
  useGhPrefix: boolean;
  reasoning: ReasoningLevel;
  effort: EffortLevel;
  search: SearchLevel;
  generationAccess?: GenerationAccess;
  generationVisibility: GenerationVisibility;
  appearance: {
    mode: AppearanceMode;
    backgroundImage?: string;
    backgroundMode: BackgroundMode;
    autoHideChromeOnMaximize: boolean;
    dockPosition: DockPosition;
    uiTypeface: Typeface;
    monoTypeface: Typeface;
    displayScale: DisplayScale;
    notificationDuration?: number;
  };
};
export type SettingsIntent =
  | { type: 'set_setting'; key: 'model'; value: ModelLevel }
  | { type: 'set_setting'; key: 'useGhPrefix'; value: boolean }
  | { type: 'set_setting'; key: 'reasoning'; value: ReasoningLevel }
  | { type: 'set_setting'; key: 'effort'; value: EffortLevel }
  | { type: 'set_setting'; key: 'search'; value: SearchLevel }
  | { type: 'set_setting'; key: 'generationAccess'; value: GenerationAccess }
  | { type: 'set_setting'; key: 'generationVisibility'; value: GenerationVisibility }
  | { type: 'set_appearance'; key: 'mode'; value: AppearanceMode }
  | { type: 'set_appearance'; key: 'backgroundMode'; value: BackgroundMode }
  | { type: 'set_appearance'; key: 'autoHideChromeOnMaximize'; value: boolean }
  | { type: 'set_appearance'; key: 'dockPosition'; value: DockPosition }
  | { type: 'set_appearance'; key: 'uiTypeface'; value: Typeface }
  | { type: 'set_appearance'; key: 'monoTypeface'; value: Typeface }
  | { type: 'set_appearance'; key: 'displayScale'; value: DisplayScale }
  | { type: 'set_appearance'; key: 'notificationDuration'; value: number }
  | { type: 'set_appearance'; key: 'backgroundImage'; value?: string };
export type AssistantContext = { nodeId?: string; windowId?: string; recentOperations?: string[]; recentLog?: string };
export type AssistantIntent = { type: 'assistant_request'; message: string; context?: AssistantContext };
export type AgentQuestion =
  | { kind: 'choices'; title: string; message: string; choices: Array<{ id: string; label: string; description?: string }>; allowCustom: boolean }
  | { kind: 'text'; title: string; message: string; placeholder?: string; initial?: string; multiline: boolean };
export type AnswerAgentQuestionIntent = { type: 'answer_agent_question'; questionId: string; answer: string };
export type RuntimeIntent = Intent | AssistantIntent | StorageIntent | SettingsIntent | BridgeIntent | AnswerAgentQuestionIntent;
export type AppSpec = { id: AppId; name: string; description: string; icon: string; category?: string };
export type AppRecord = AppSpec & { installed: boolean; status: 'placeholder' | 'available' | 'failed' };
export type WindowModel = { id: string; appId: AppId; title: string; route?: string; state: WindowState; focused: boolean; position: { x: number; y: number }; size: { width: number; height: number } };
export type ControlModel = { id: string; kind: 'link' | 'button' | 'input' | 'form'; label: string; action: Intent };
export type SurfaceField = { id: string; label: string; placeholder?: string; value?: string; type?: 'text' | 'search' | 'number' | 'checkbox' | 'radio' };
export type BoardModel = { columns: number; rows: number; activePiece?: string; nextPiece?: string; score?: number; lines?: number; level?: number; state?: string };
export type SurfaceContent = { heading: string; body: string; controls: ControlModel[]; fields?: SurfaceField[]; board?: BoardModel; links?: Array<{ id: string; label: string; route: string }>; payload?: unknown; entry?: string };
export type Surface = { id: string; appId: AppId; route: string; title: string; status: SurfaceState; content: SurfaceContent; entry?: string };
export type Operation = { id: string; intent: RuntimeIntent; state: OperationState; message?: string };
export type RuntimeSnapshot = { windows: WindowModel[]; operations: Operation[]; notifications: string[]; apps: AppRecord[]; surfaces: Surface[]; settings: VibeOSSettings };
export type TaskTraceKind = 'begin' | 'message' | 'tool_call' | 'reason' | 'end';
export type RuntimeEvent = { type: 'snapshot'; snapshot: RuntimeSnapshot } | { type: 'operation'; operation: Operation } | { type: 'window'; window: WindowModel } | { type: 'surface'; surface: Surface } | { type: 'world_changed'; apps: AppId[]; routes?: string[] } | { type: 'state_changed'; appId: AppId; revision: number; state: unknown } | { type: 'notification'; message: string; level?: 'info' | 'success' | 'warning' | 'error'; timeoutMs?: number } | { type: 'task_trace'; taskId: string; title: string; kind: TaskTraceKind; text: string; status?: 'active' | 'success' | 'error' } | { type: 'agent_question'; questionId: string; title: string; question: AgentQuestion } | { type: 'trace'; operationId?: string; message: string } | { type: 'bridge_result'; requestId: string; ok: boolean; value?: unknown; error?: string };
export type AgentTask = { operationId: string; capability: string; intent: RuntimeIntent; input: unknown; target: string; context?: { parent?: unknown; node?: unknown; siblings?: unknown[]; existingFiles?: string[]; acceptance?: string[]; settings?: VibeOSSettings; observation?: { kind: 'window-screenshot'; appId: AppId; windowId?: string; path: string; capturedAt: string } } };
export type AgentResult = { ok: true; capability: string; files?: string[]; result?: { status?: 'ready' | 'deferred' | 'needs_input'; summary?: string; changedApps?: AppId[]; routes?: string[]; statePatches?: Array<{ appId: AppId; patch: JsonPatchOperation[]; revision?: number }>; value?: unknown; questionId?: string; question?: AgentQuestion } } | { ok: false; message: string };
export * from './world.js';
