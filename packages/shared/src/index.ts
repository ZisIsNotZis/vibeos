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
  | { type: 'open_surface'; appId: AppId; route: string }
  | { type: 'navigate'; target: string }
  | { type: 'activate_control'; appId: AppId; surfaceId: string; controlId: string; input?: unknown }
  | { type: 'install_app'; app: AppSpec }
  | { type: 'search_apps'; query: string }
  | { type: 'open_file'; path: string }
  | { type: 'create_file'; path: string; content?: string }
  | { type: 'navigate_browser'; url: string };
export type AppSpec = { id: AppId; name: string; description: string; icon: string; category?: string };
export type AppRecord = AppSpec & { installed: boolean; status: 'placeholder' | 'available' | 'failed' };
export type WindowModel = { id: string; appId: AppId; title: string; state: WindowState; focused: boolean };
export type ControlModel = { id: string; kind: 'link' | 'button' | 'input' | 'form'; label: string; action: Intent };
export type SurfaceContent = { heading: string; body: string; controls: ControlModel[]; links?: Array<{ id: string; label: string; route: string }> };
export type Surface = { id: string; appId: AppId; route: string; title: string; status: SurfaceState; content: SurfaceContent };
export type Operation = { id: string; intent: Intent; state: OperationState; message?: string };
export type RuntimeSnapshot = { windows: WindowModel[]; operations: Operation[]; notifications: string[]; apps: AppRecord[]; surfaces: Surface[] };
export type RuntimeEvent = { type: 'snapshot'; snapshot: RuntimeSnapshot } | { type: 'operation'; operation: Operation } | { type: 'window'; window: WindowModel } | { type: 'surface'; surface: Surface } | { type: 'notification'; message: string } | { type: 'trace'; operationId?: string; message: string };
export type AgentTask = { operationId: string; capability: string; intent: Intent; input: unknown; target: string };
export type AgentResult = { ok: true; capability: string; files?: string[] } | { ok: false; message: string };
export type McpToolCall = { jsonrpc: '2.0'; id: string | number; method: 'tools/call'; params: { name: string; arguments?: Record<string, unknown> } };
