import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import type { AgentTask, AgentQuestion, EffortLevel, ModelLevel, SearchLevel } from '@vibeos/shared';

export type WorkerModel = `gpt-5.6-${ModelLevel}` | `gh/gpt-5.6-${ModelLevel}`;
export type WorkerProfile = { effort: EffortLevel; model: WorkerModel; reasoning: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'; repairBudget: number };
export type HarnessPaths = { worldRoot: string; jobsRoot: string };
export type ExplicitReferences = {
  local: Array<{ source: string; staged: string; kind: 'file' | 'directory' }>;
  urls: string[];
  libraries: string[];
  forceSearch: boolean;
};
export type StagedJob = { id: string; root: string; input: string; framework: string; output: string; outputApp: string; evidence: string; workOrder: string; resultSchema: string; resultFile: string; liveTarget: string; appId: string; references: ExplicitReferences };
export type CodexInvocation = { command: string; args: string[]; cwd: string; env: Record<string, string> };
export type CandidateValidation = { ok: true; files: string[]; bytes: number } | { ok: false; errors: string[] };
export type JobState = 'staged' | 'running' | 'waiting_input' | 'verifying' | 'repairing' | 'published' | 'failed';

const effortTable: Record<EffortLevel, { repairBudget: number }> = { fast: { repairBudget: 0 }, balanced: { repairBudget: 1 }, quality: { repairBudget: 2 }, ultra: { repairBudget: 3 } };

export function modelName(model: ModelLevel, useGhPrefix = false): WorkerModel { return `${useGhPrefix ? 'gh/' : ''}gpt-5.6-${model}` as WorkerModel; }
export function selectWorkerProfile(effort: EffortLevel, model: WorkerProfile['model'] = modelName('terra'), reasoning: WorkerProfile['reasoning'] = effort === 'fast' ? 'low' : effort === 'ultra' ? 'max' : effort === 'balanced' ? 'medium' : 'high'): WorkerProfile { return { effort, model, reasoning, ...effortTable[effort] }; }

export function createStagedJob(task: AgentTask, paths: HarnessPaths): StagedJob {
  const liveTarget = resolveOwnedAppTarget(task.target, paths.worldRoot);
  const appId = basename(liveTarget);
  mkdirSync(paths.jobsRoot, { recursive: true });
  const root = mkdtempSync(join(paths.jobsRoot, 'job-'));
  const input = join(root, 'input'); const framework = join(root, 'framework'); const output = join(root, 'output'); const outputApp = join(output, 'app'); const evidence = join(root, 'evidence');
  for (const path of [input, framework, outputApp, evidence, join(root, 'home'), join(root, 'tmp')]) mkdirSync(path, { recursive: true });
  if (existsSync(liveTarget)) copySourceTree(liveTarget, outputApp);
  const settings = task.context?.settings; const profile = selectWorkerProfile(settings?.effort ?? 'quality', modelName(settings?.model ?? 'terra', settings?.useGhPrefix ?? false), settings?.reasoning ?? 'high');
  const references = inspectExplicitReferences(task);
  stageExplicitReferences(references, input);
  if (task.capability === 'app:identity' && !existsSync(join(outputApp, 'node.json'))) {
    const app = (task.input as { name?: string; id?: string } | undefined) ?? {};
    writeFileSync(join(outputApp, 'node.json'), JSON.stringify({ id: app.id ?? appId, title: canonicalAppName(app.name ?? appId), kind: 'app', status: 'placeholder', icon: 'icon.svg', children: [] }, null, 2) + '\n');
  }
  const workOrder = join(input, 'work-order.json');
  const context = task.context ? {
    node: task.context.node,
    parent: task.context.parent,
    siblings: task.context.siblings,
    existingFiles: task.context.existingFiles,
    acceptance: task.context.acceptance,
    observation: task.context.observation ? { ...task.context.observation, path: 'input/observation/window.png' } : undefined,
    settings: settings ? { model: settings.model, useGhPrefix: settings.useGhPrefix, reasoning: settings.reasoning, effort: settings.effort, search: settings.search } : undefined
  } : undefined;
  const identity = task.capability === 'app:identity' ? { requestedName: (task.input as { name?: string } | undefined)?.name ?? appId, canonicalName: canonicalAppName((task.input as { name?: string } | undefined)?.name ?? appId), appId } : undefined;
  writeFileSync(workOrder, JSON.stringify({ v: 2, operationId: task.operationId, capability: task.capability, outcome: coherentOutcome(task), identity, intent: task.intent, input: task.input, context, target: { appId, output: 'output/app' }, profile, references }) + '\n');
  writeFileSync(join(framework, 'FRAMEWORK.md'), frameworkGuide);
  writeFileSync(join(framework, 'bridge.d.ts'), bridgeTypes);
  writeFileSync(join(framework, 'bridge.js'), bridgeClient);
  writeFileSync(join(framework, 'theme.css'), themeContract);
  writeFileSync(join(input, 'acceptance.json'), JSON.stringify(buildAcceptance(task, profile.effort)) + '\n');
  if (task.context?.observation?.path) {
    const observation = task.context.observation;
    if (existsSync(observation.path)) { const destination = join(input, 'observation', 'window.png'); mkdirSync(dirname(destination), { recursive: true }); cpSync(observation.path, destination); }
  }
  stageAgentMemory(paths.worldRoot, liveTarget, input);
  if (existsSync(liveTarget)) cpSync(liveTarget, join(input, 'current-node'), { recursive: true, filter: source => !source.split(sep).includes('data') });
  const resultSchema = join(input, 'result.schema.json'); const resultFile = join(evidence, 'result.json');
  writeFileSync(resultSchema, JSON.stringify(workerResultSchema, null, 2) + '\n');
  updateJobRecord({ root } as StagedJob, 'staged', { operationId: task.operationId, capability: task.capability, profile });
  return { id: basename(root), root, input, framework, output, outputApp, evidence, workOrder, resultSchema, resultFile, liveTarget, appId, references };
}

export function updateJobRecord(staged: Pick<StagedJob, 'root'>, state: JobState, detail: Record<string, unknown> = {}) {
  const path = join(staged.root, 'job.json'); let previous: Record<string, unknown> = {};
  try { previous = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; } catch {}
  writeFileSync(path, JSON.stringify({ ...previous, ...detail, state, updatedAt: new Date().toISOString(), createdAt: previous.createdAt ?? new Date().toISOString() }, null, 2) + '\n');
}

export function buildCodexInvocation(staged: Pick<StagedJob, 'root' | 'resultSchema' | 'resultFile'>, profile: WorkerProfile, search: SearchLevel, prompt: string, command = 'codex', baseEnv: NodeJS.ProcessEnv = process.env, forceSearch = false): CodexInvocation {
  const args = ['-a', 'never'];
  if (search !== 'none' || forceSearch) args.push('--search');
  args.push('exec', '--ephemeral', '--model', profile.model, '-c', `model_reasoning_effort=${profile.reasoning}`, '--sandbox', 'workspace-write', '--cd', staged.root, '--output-schema', staged.resultSchema, '--output-last-message', staged.resultFile, '--json', prompt);
  // Preserve the user's Codex configuration/authentication. Omniroute and
  // localhost providers are commonly configured in ~/.codex/config.toml.
  const home = baseEnv.HOME ?? homedir(); const codexHome = baseEnv.CODEX_HOME ?? join(home, '.codex'); const temporary = join(staged.root, 'tmp');
  mkdirSync(temporary, { recursive: true });
  const env: Record<string, string> = { PATH: baseEnv.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: home, CODEX_HOME: codexHome, TMPDIR: temporary, LANG: baseEnv.LANG ?? 'C.UTF-8' };
  // Codex may authenticate through the environment even when its provider is
  // configured in ~/.codex/config.toml. Forward only the credential it needs;
  // do not pass the entire parent environment into a worker.
  if (baseEnv.OPENAI_API_KEY) env.OPENAI_API_KEY = baseEnv.OPENAI_API_KEY;
  return { command, args, cwd: staged.root, env };
}

export function validateCandidateTree(root: string, limits = { maxFiles: 800, maxBytes: 100 * 1024 * 1024, maxFileBytes: 20 * 1024 * 1024, maxDepth: 12 }): CandidateValidation {
  const files: string[] = []; const errors: string[] = []; let bytes = 0;
  const walk = (path: string, depth: number) => {
    if (depth > limits.maxDepth) { errors.push('candidate exceeds maximum directory depth'); return; }
    for (const entry of readdirSync(path)) {
      const child = join(path, entry); const rel = relative(root, child); const stat = lstatSync(child);
      if (stat.isSymbolicLink()) { errors.push(`${rel} is a symbolic link`); continue; }
      if (stat.isDirectory()) { walk(child, depth + 1); continue; }
      if (!stat.isFile()) { errors.push(`${rel} is not a regular file`); continue; }
      if (stat.nlink !== 1) errors.push(`${rel} has multiple hard links`);
      if (stat.size > limits.maxFileBytes) errors.push(`${rel} exceeds maximum file size`);
      bytes += stat.size; files.push(rel);
      if (files.length > limits.maxFiles) errors.push('candidate exceeds maximum file count');
      if (bytes > limits.maxBytes) errors.push('candidate exceeds maximum total size');
    }
  };
  try { walk(root, 0); } catch (cause) { errors.push(cause instanceof Error ? cause.message : 'candidate could not be inspected'); }
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, files, bytes };
}

export function publishCandidate(candidate: string, liveTarget: string, validatePublished?: (target: string) => void) {
  const checked = validateCandidateTree(candidate); if (!checked.ok) throw new Error(`Candidate rejected: ${checked.errors.join('; ')}`);
  const parent = dirname(liveTarget); mkdirSync(parent, { recursive: true });
  const incoming = join(parent, `.${basename(liveTarget)}.incoming-${process.pid}-${Date.now()}`); const backup = join(parent, `.${basename(liveTarget)}.backup-${process.pid}-${Date.now()}`);
  cpSync(candidate, incoming, { recursive: true, errorOnExist: true });
  const data = join(liveTarget, 'data'); if (existsSync(data)) cpSync(data, join(incoming, 'data'), { recursive: true });
  let backedUp = false;
  try {
    if (existsSync(liveTarget)) { renameSync(liveTarget, backup); backedUp = true; }
    renameSync(incoming, liveTarget);
    validatePublished?.(liveTarget);
    if (backedUp) rmSync(backup, { recursive: true, force: true });
  } catch (cause) {
    if (existsSync(incoming)) rmSync(incoming, { recursive: true, force: true });
    if (backedUp) {
      if (existsSync(liveTarget)) rmSync(liveTarget, { recursive: true, force: true });
      renameSync(backup, liveTarget);
    }
    throw cause;
  }
}

export function readStructuredWorkerResult(path: string) {
  const value = JSON.parse(readFileSync(path, 'utf8')) as { status?: unknown; summary?: unknown; statePatches?: unknown; question?: unknown; value?: unknown };
  if ((value.status !== 'ready' && value.status !== 'needs_input') || typeof value.summary !== 'string') throw new Error('Worker did not return a valid structured result.');
  if (value.statePatches !== undefined && (!Array.isArray(value.statePatches) || value.statePatches.some(item => !item || typeof item !== 'object'))) throw new Error('Worker returned invalid state patches.');
  const result: { status: 'ready' | 'needs_input'; summary: string; question?: AgentQuestion; statePatches?: Array<{ appId: string; patch: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }>; revision?: number }>; value?: unknown } = { status: value.status, summary: value.summary };
  if (value.statePatches !== undefined) result.statePatches = (value.statePatches as Array<{ appId: string; revision?: number; patch: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }> }>).map(mutation => ({ ...mutation, patch: mutation.patch.map(operation => {
    // Strict structured-output validators cannot represent an unconstrained
    // JSON value object. The worker therefore transports every patch value as
    // JSON text; decode it at the typed runtime boundary.
    if (operation.op === 'remove') return operation;
    if (typeof operation.value !== 'string') throw new Error('Worker state patch value must be JSON text.');
    try { return { ...operation, value: JSON.parse(operation.value) }; }
    catch { throw new Error('Worker state patch value is not valid JSON text.'); }
  }) }));
  if (value.value !== undefined) result.value = value.value;
  if (value.status === 'needs_input') {
    if ((result.statePatches?.length ?? 0) > 0) throw new Error('Worker may not apply state patches while waiting for input.');
    const question = validateQuestion(value.question);
    if (!question) throw new Error('Worker requested input without a valid question.');
    result.question = question;
  }
  return result;
}

function validateQuestion(value: unknown): AgentQuestion | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 || typeof item.message !== 'string' || !item.message.trim() || item.message.length > 2000) return undefined;
  if (item.kind === 'choices' && Array.isArray(item.choices) && typeof item.allowCustom === 'boolean' && item.choices.length > 0 && item.choices.length <= 8) {
    const choices = item.choices.map(choice => choice && typeof choice === 'object' ? choice as Record<string, unknown> : undefined);
    if (choices.some(choice => !choice || typeof choice.id !== 'string' || !choice.id.trim() || typeof choice.label !== 'string' || !choice.label.trim() || (choice.description !== undefined && choice.description !== null && typeof choice.description !== 'string'))) return undefined;
    return { kind: 'choices', title: item.title.trim(), message: item.message.trim(), choices: choices.map(choice => ({ id: choice!.id as string, label: choice!.label as string, ...(typeof choice!.description === 'string' ? { description: choice!.description } : {}) })), allowCustom: item.allowCustom };
  }
  if (item.kind === 'text' && typeof item.multiline === 'boolean' && (item.placeholder === undefined || typeof item.placeholder === 'string') && (item.initial === undefined || typeof item.initial === 'string')) return { kind: 'text', title: item.title.trim(), message: item.message.trim(), multiline: item.multiline, ...(typeof item.placeholder === 'string' ? { placeholder: item.placeholder } : {}), ...(typeof item.initial === 'string' ? { initial: item.initial } : {}) };
  return undefined;
}

function stageAgentMemory(worldRoot: string, liveTarget: string, input: string) {
  const sources = [join(worldRoot, 'AGENT.md'), join(worldRoot, 'apps', 'AGENT.md'), join(liveTarget, 'AGENT.md')];
  const destination = join(input, 'memory'); let used = 0; const limit = 32 * 1024;
  for (const [index, source] of sources.entries()) {
    if (!existsSync(source)) continue;
    const text = readFileSync(source, 'utf8');
    const remaining = limit - used; if (remaining <= 0) break;
    const clipped = text.slice(0, remaining); used += Buffer.byteLength(clipped);
    mkdirSync(destination, { recursive: true }); writeFileSync(join(destination, `${String(index).padStart(2, '0')}-${index === 2 ? 'current' : index === 1 ? 'apps' : 'world'}.md`), clipped);
  }
}

function resolveOwnedAppTarget(target: string, worldRoot: string) {
  const apps = resolve(worldRoot, 'apps'); const resolved = resolve(target);
  if (!resolved.startsWith(`${apps}${sep}`) || dirname(resolved) !== apps || !/^app-[a-zA-Z0-9_-]+$|^[a-zA-Z0-9_-]+$/.test(basename(resolved))) throw new Error('Ordinary generation target must be one direct app subtree.');
  return resolved;
}

function canonicalAppName(value: string) {
  return value.trim().replace(/\b\w/g, character => character.toUpperCase()) || 'Application';
}

function copySourceTree(source: string, destination: string) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'data') continue;
    const from = join(source, entry.name); const to = join(destination, entry.name); const stat = lstatSync(from);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Existing app source contains unsupported entry: ${entry.name}`);
    if (stat.isDirectory()) { mkdirSync(to, { recursive: true }); copySourceTree(from, to); } else cpSync(from, to);
  }
}

/** Extract only references that look deliberately supplied by the user. The
 * worker never receives arbitrary parent-process environment or filesystem
 * access: existing references are copied into input/references and described
 * in the work order. Browser-surface URLs remain VibeOS content requests. */
export function inspectExplicitReferences(task: AgentTask): ExplicitReferences {
  const values: string[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8) return;
    if (typeof value === 'string') { values.push(value); return; }
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    if (value && typeof value === 'object') Object.values(value).forEach(item => visit(item, depth + 1));
  };
  visit({ input: task.input, intent: task.intent });
  const urls = [...new Set(values.flatMap(value => value.match(/https?:\/\/[^\s<>"'`]+/gi) ?? []).map(value => value.replace(/[),.;]+$/, '')))]
    .filter(() => !task.capability.startsWith('surface:browser:'));
  const localCandidates = [...new Set(values.flatMap(value => value.match(/(?:^|[\s("'=:])((?:~\/|\/|\.\.\/|\.\/)[^\s<>"'`,;]+)/g)?.map(match => match.trim().replace(/^[\s("'=:]+/, '').replace(/[),.;]+$/, '')) ?? []))];
  const local: ExplicitReferences['local'] = [];
  for (const candidate of localCandidates) {
    const source = resolve(candidate.startsWith('~/') ? join(homedir(), candidate.slice(2)) : candidate);
    if (!existsSync(source)) continue;
    const stat = lstatSync(source);
    if (!stat.isFile() && !stat.isDirectory()) continue;
    if (stat.isDirectory() && stat.size > 64 * 1024 * 1024) continue;
    local.push({ source, staged: `input/references/${String(local.length).padStart(2, '0')}-${basename(source)}`, kind: stat.isDirectory() ? 'directory' : 'file' });
    if (local.length >= 12) break;
  }
  const libraries = [...new Set(values.flatMap(value => {
    const matches = value.match(/\b(?:use|install|依赖|使用)\s+(?:the\s+)?([@a-zA-Z0-9][@a-zA-Z0-9._/-]*(?:\s+(?:library|package|module))?)/gi) ?? [];
    return matches.map(match => match.replace(/^\s*(?:use|install|依赖|使用)\s+(?:the\s+)?/i, '').replace(/\s+(?:library|package|module)\s*$/i, '').trim());
  }).filter(value => value.length > 1 && value.length < 160))];
  return { local, urls, libraries, forceSearch: urls.length > 0 || libraries.length > 0 };
}

function stageExplicitReferences(references: ExplicitReferences, input: string) {
  for (const reference of references.local) {
    const destination = join(input, 'references', reference.staged.split('/').at(-1)!);
    mkdirSync(dirname(destination), { recursive: true });
    if (reference.kind === 'directory') copyReferenceTree(reference.source, destination);
    else cpSync(reference.source, destination);
  }
}

function copyReferenceTree(source: string, destination: string, depth = 0) {
  if (depth > 8) throw new Error('Referenced directory is too deep to stage safely.');
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name); const to = join(destination, entry.name); const stat = lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`Referenced directory contains a symbolic link: ${entry.name}`);
    if (stat.isDirectory()) copyReferenceTree(from, to, depth + 1);
    else if (stat.isFile()) { if (stat.size > 20 * 1024 * 1024) throw new Error(`Referenced file is too large: ${entry.name}`); cpSync(from, to); }
  }
}

// The Responses/OpenAI schema validator requires an explicit JSON Schema type
// for every property. `const` alone is rejected by some compatible gateways.
const workerResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'statePatches', 'question', 'value'],
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_input'] },
    summary: { type: 'string', minLength: 1 },
    statePatches: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['appId', 'revision', 'patch'], properties: { appId: { type: 'string', minLength: 1 }, revision: { type: 'integer', minimum: 0 }, patch: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['op', 'path', 'value'], properties: { op: { type: 'string', enum: ['add', 'replace', 'remove'] }, path: { type: 'string', pattern: '^/' }, value: { type: 'string' } } } } } } },
    question: { anyOf: [ { type: 'null' }, { type: 'object', additionalProperties: false, required: ['kind', 'title', 'message', 'choices', 'allowCustom'], properties: { kind: { type: 'string', enum: ['choices'] }, title: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 }, choices: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'description'], properties: { id: { type: 'string', minLength: 1 }, label: { type: 'string', minLength: 1 }, description: { type: ['string', 'null'] } } } }, allowCustom: { type: 'boolean' } } }, { type: 'object', additionalProperties: false, required: ['kind', 'title', 'message', 'placeholder', 'initial', 'multiline'], properties: { kind: { type: 'string', enum: ['text'] }, title: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 }, placeholder: { type: ['string', 'null'] }, initial: { type: ['string', 'null'] }, multiline: { type: 'boolean' } } } ] },
    value: { type: ['string', 'null'] }
  }
};
function coherentOutcome(task: AgentTask) { return task.capability === 'app:identity' ? 'A recognizable, launchable app identity with a serious app-specific SVG icon.' : 'A polished, usable vertical slice whose primary workflow and every visible local control work.'; }
function buildAcceptance(task: AgentTask, effort: EffortLevel) { const required = task.capability.startsWith('surface:') ? ['requested route is represented by a node.json in the app tree', ...(task.context?.acceptance ?? [])] : task.context?.acceptance ?? []; return { version: 1, goal: coherentOutcome(task), required, themes: effort === 'fast' ? [] : ['dark', 'light', 'desert'], viewports: effort === 'fast' ? [] : [[760, 500], [1280, 800]], forbidBrokenAssets: true, forbidConsoleErrors: effort !== 'fast' }; }
const bridgeTypes = `type AppState={appId:string;revision:number;state:unknown}; type VibeOSCommand={id:string;title:string;detail?:string;context?:unknown}; type VibeOSContextItem={id:string;label:string;disabled?:boolean}; interface VibeOSBridge { request(operation: unknown): Promise<unknown>; notify(message:string,options?:{level?:'info'|'success'|'warning'|'error';timeoutMs?:number}):Promise<{message:string;level:string;timeoutMs:number}>; navigate(url: string, mode?: 'search_results' | 'destination'): Promise<unknown>; storage: { read(key: string): Promise<unknown>; write(key: string, value: unknown): Promise<unknown> }; state: { read(): Promise<AppState>; write(state: unknown, revision?: number): Promise<AppState>; subscribe(listener:(state:AppState)=>void):()=>void }; dispatch(intent: unknown): Promise<unknown>; ai: { command(command: string, options?: { scope?: 'app'|'descendants'|'world'|{appId:string}; context?: unknown; output?: 'result'|'modify'|'navigate'|'generate' }): Promise<{value?:string;summary:string}> }; commands: { register(command:VibeOSCommand):()=>void; setContext(provider:()=>unknown):void }; contextMenu: { open(items:VibeOSContextItem[],point?:{x:number;y:number}):Promise<string|null> }; }\ndeclare global { interface Window { vibeOS: VibeOSBridge } }\nexport {};\n`;
const bridgeClient = `// window.vibeOS is injected by the generated-surface host. It includes storage, browser-native local export through standard Blob + <a download>, navigation, dispatch, ai.command({scope,context,output}), and contextMenu.open(items, point). Do not access parent DOM, open runtime sockets, or use ambient host APIs.\n`;
const themeContract = `:root{--vibe-font-ui:Inter,ui-sans-serif,system-ui,sans-serif;--vibe-font-mono:"DM Mono",ui-monospace,SFMono-Regular,Menlo,monospace;--vibe-text-caption:calc(11px * var(--vibe-scale,1));--vibe-text-label:calc(12px * var(--vibe-scale,1));--vibe-text-body:calc(14px * var(--vibe-scale,1));--vibe-text-title:calc(18px * var(--vibe-scale,1));--vibe-text-heading:calc(24px * var(--vibe-scale,1));--vibe-text-display:calc(34px * var(--vibe-scale,1));--vibe-line-tight:1.15;--vibe-line-normal:1.5}:root[data-ui-typeface="system"]{--vibe-font-ui:system-ui,-apple-system,"Segoe UI",sans-serif}:root[data-ui-typeface="accessible"]{--vibe-font-ui:Arial,Helvetica,sans-serif}:root[data-mono-typeface="system"]{--vibe-font-mono:ui-monospace,monospace}:root[data-mono-typeface="accessible"]{--vibe-font-mono:"Courier New",monospace}:root[data-display-scale="compact"]{--vibe-scale:.8}:root[data-display-scale="comfortable"]{--vibe-scale:1.1}:root[data-display-scale="large"]{--vibe-scale:1.25}:root[data-display-scale="extra_large"]{--vibe-scale:1.5}:root,:root[data-theme="dark"]{--vibe-surface:#191923;--vibe-raised:#242431;--vibe-control:#303044;--vibe-text:#f1f1f6;--vibe-muted:#aeb0c2;--vibe-border:#ffffff22;--vibe-accent:#a89dfc;color-scheme:dark}:root[data-theme="light"]{--vibe-surface:#f7f8fc;--vibe-raised:#fff;--vibe-control:#e8ebf3;--vibe-text:#20202b;--vibe-muted:#596070;--vibe-border:#20202b22;--vibe-accent:#6658cf;color-scheme:light}:root[data-theme="desert"]{--vibe-surface:#f5e6c8;--vibe-raised:#fff7e5;--vibe-control:#dfbf82;--vibe-text:#302016;--vibe-muted:#674b34;--vibe-border:#5b371f35;--vibe-accent:#a85028;color-scheme:light}\n`;
const frameworkGuide = `# VibeOS capability worker\n\nRead the work order and acceptance files. If input/memory exists, read its Markdown files from lowest to highest filename: they are inherited durable context. Only output/app/AGENT.md is writable persistent memory. Keep it concise (under 16 KiB): durable decisions, constraints, pending user action; never raw transcripts. Modify only output/app. Never put references to framework/, input/, output/, or the staged job into published HTML/CSS/JS; copy needed CSS/JS into output/app or use inline code.\n\nChange policy: make the smallest complete delta that realizes the request. Inspect the existing app before editing. Preserve unrelated visual identity, working workflows, routes, state shape, and local assets. Do not replace an entrypoint or visual shell for a localized feature; if a rewrite is genuinely necessary, retain equivalent behavior and verify it visibly. Completion means the requested user-visible outcome is observable, not merely internally stored or claimed. When a request explicitly asks for a real external/browser capability, use the real available mechanism; for export use standard Blob plus a temporary <a download>. If it is unavailable, ask a typed question or state the limit plainly—never simulate success.\n\nGraphics and game work: build a real playable/rendered vertical slice. Use an actual Canvas/WebGL/SVG scene or proven library with a coherent coordinate system, camera/viewport, render/update loop, input mapping, entities/rules/collision, feedback, HUD, pause/restart/exit, and state persistence required by the page. Make controls cause visible world changes and navigation open a real child surface or AI command. For visual editors, implement a genuinely editable canvas with expected selection, pan/zoom, pointer/keyboard behavior, and save/undo behavior for the current slice. Prefer a smaller complete loop to decorative breadth; test the primary loop, resizing, restart/exit, and an edge path.\n\nThe host owns global shortcuts, Ctrl/Cmd+K, window controls, command palette, and Chinese IME: do not duplicate them. Use window.vibeOS.notify(message,{level,timeoutMs}) for transient OS notifications. For contextual actions, handle contextmenu on the relevant app element, prevent the browser menu, then await vibeOS.contextMenu.open([{id,label}],{x:event.clientX,y:event.clientY}); perform the selected local action yourself. When useful, use vibeOS.commands.setContext(() => context) and vibeOS.commands.register(). An app may call vibeOS.ai.command for open-ended work. If input.output is "result", do not fake a local response: return a concise actual response in result value, keep statePatches [], and do not change source unless explicitly asked.\n\nFor app identity jobs, preserve the starter node.json, set a canonical non-empty title, create a valid drawable icon.svg with viewBox and visible geometry, and do not replace it with sparkle/emoji/Lucide/generic artwork. For surface jobs, publish the requested route through the node tree: update the node.json at that node with either an inline surface object or a valid relative entry file. For route /, the app-root node.json itself must expose the route; an unreferenced index.html is insufficient. A surface object uses this safe shape: {heading: string, body: string, controls: []}; controls is always an array, and each control has {id: string, label: string, intent: object}. Use [] when there are no controls.\n\nThe structured result always has status, summary, statePatches, question, value. For ordinary completion return {"status":"ready","summary":"…","statePatches":[],"question":null,"value":null}. Ask only for a material choice that blocks quality; never ask to avoid work. For a question return status "needs_input", statePatches [], value null, and either a choices question {kind,title,message,choices:[{id,label,description:null}],allowCustom} or text question {kind,title,message,placeholder:null,initial:null,multiline}. The same staged job will resume with input/answer.json. Every state patch must include appId, revision, and patch. State patch values use JSON text: value: JSON.stringify(actualValue), including primitives; remove uses value: "null". If an app has user work, persist the smallest complete state with bridge storage or bridge state, load it before the first visible render, and never overwrite unrelated persisted fields. Any pane, palette, list, or long screen must stay within its client area with contained overflow:auto instead of escaping the window. For normal pages, every visible control and primary workflow works now, with local assets, no overflow, semantic theme tokens, and valid node routes. Before returning, exercise the requested primary flow and one pre-existing related flow; inspect the result at the supplied themes/viewports when required. Return the required structured result.\n\nExplicit references: when the task names a real URL, local/host path, or library/package, inspect/use it even if search is none. Real URLs and local paths are supplied in the work order; local copies are in input/references. Use the requested library rather than replacing it with a home-grown approximation; install or fetch it only through permitted worker tools, and verify it. A VibeOS browser URL is generated world content, not a request to access that real site.\n`;
