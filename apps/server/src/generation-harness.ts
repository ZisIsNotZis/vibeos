import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import type { AgentTask, EffortLevel, SearchLevel } from '@vibeos/shared';

export type WorkerProfile = { effort: EffortLevel; model: 'gh/gpt-5.6-luna' | 'gh/gpt-5.6-terra' | 'gh/gpt-5.6-sol'; reasoning: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'; repairBudget: number };
export type HarnessPaths = { worldRoot: string; jobsRoot: string };
export type StagedJob = { id: string; root: string; input: string; framework: string; output: string; outputApp: string; evidence: string; workOrder: string; resultSchema: string; resultFile: string; liveTarget: string; appId: string };
export type CodexInvocation = { command: string; args: string[]; cwd: string; env: Record<string, string> };
export type CandidateValidation = { ok: true; files: string[]; bytes: number } | { ok: false; errors: string[] };
export type JobState = 'staged' | 'running' | 'verifying' | 'repairing' | 'published' | 'failed';

const effortTable: Record<EffortLevel, { repairBudget: number }> = { fast: { repairBudget: 0 }, balanced: { repairBudget: 1 }, quality: { repairBudget: 2 }, ultra: { repairBudget: 3 } };

export function selectWorkerProfile(effort: EffortLevel, model: WorkerProfile['model'] = 'gh/gpt-5.6-terra', reasoning: WorkerProfile['reasoning'] = effort === 'fast' ? 'low' : effort === 'ultra' ? 'max' : effort === 'balanced' ? 'medium' : 'high'): WorkerProfile { return { effort, model, reasoning, ...effortTable[effort] }; }

export function createStagedJob(task: AgentTask, paths: HarnessPaths): StagedJob {
  const liveTarget = resolveOwnedAppTarget(task.target, paths.worldRoot);
  const appId = basename(liveTarget);
  mkdirSync(paths.jobsRoot, { recursive: true });
  const root = mkdtempSync(join(paths.jobsRoot, 'job-'));
  const input = join(root, 'input'); const framework = join(root, 'framework'); const output = join(root, 'output'); const outputApp = join(output, 'app'); const evidence = join(root, 'evidence');
  for (const path of [input, framework, outputApp, evidence, join(root, 'home'), join(root, 'tmp')]) mkdirSync(path, { recursive: true });
  if (existsSync(liveTarget)) copySourceTree(liveTarget, outputApp);
  const settings = task.context?.settings; const profile = selectWorkerProfile(settings?.effort ?? 'quality', `gh/gpt-5.6-${settings?.model ?? 'terra'}` as WorkerProfile['model'], settings?.reasoning ?? 'high');
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
    settings: settings ? { model: settings.model, reasoning: settings.reasoning, effort: settings.effort, search: settings.search } : undefined
  } : undefined;
  const identity = task.capability === 'app:identity' ? { requestedName: (task.input as { name?: string } | undefined)?.name ?? appId, canonicalName: canonicalAppName((task.input as { name?: string } | undefined)?.name ?? appId), appId } : undefined;
  writeFileSync(workOrder, JSON.stringify({ v: 2, operationId: task.operationId, capability: task.capability, outcome: coherentOutcome(task), identity, intent: task.intent, input: task.input, context, target: { appId, output: 'output/app' }, profile }) + '\n');
  writeFileSync(join(framework, 'FRAMEWORK.md'), frameworkGuide);
  writeFileSync(join(framework, 'bridge.d.ts'), bridgeTypes);
  writeFileSync(join(framework, 'bridge.js'), bridgeClient);
  writeFileSync(join(framework, 'theme.css'), themeContract);
  writeFileSync(join(input, 'acceptance.json'), JSON.stringify(buildAcceptance(task, profile.effort)) + '\n');
  if (existsSync(liveTarget)) cpSync(liveTarget, join(input, 'current-node'), { recursive: true, filter: source => !source.split(sep).includes('data') });
  const resultSchema = join(input, 'result.schema.json'); const resultFile = join(evidence, 'result.json');
  writeFileSync(resultSchema, JSON.stringify(workerResultSchema, null, 2) + '\n');
  updateJobRecord({ root } as StagedJob, 'staged', { operationId: task.operationId, capability: task.capability, profile });
  return { id: basename(root), root, input, framework, output, outputApp, evidence, workOrder, resultSchema, resultFile, liveTarget, appId };
}

export function updateJobRecord(staged: Pick<StagedJob, 'root'>, state: JobState, detail: Record<string, unknown> = {}) {
  const path = join(staged.root, 'job.json'); let previous: Record<string, unknown> = {};
  try { previous = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; } catch {}
  writeFileSync(path, JSON.stringify({ ...previous, ...detail, state, updatedAt: new Date().toISOString(), createdAt: previous.createdAt ?? new Date().toISOString() }, null, 2) + '\n');
}

export function buildCodexInvocation(staged: Pick<StagedJob, 'root' | 'resultSchema' | 'resultFile'>, profile: WorkerProfile, search: SearchLevel, prompt: string, command = 'codex', baseEnv: NodeJS.ProcessEnv = process.env): CodexInvocation {
  const args = ['-a', 'never'];
  if (search !== 'none') args.push('--search');
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
  const value = JSON.parse(readFileSync(path, 'utf8')) as { status?: unknown; summary?: unknown };
  if (value.status !== 'ready' || typeof value.summary !== 'string') throw new Error('Worker did not return a valid structured result.');
  return { status: 'ready' as const, summary: value.summary };
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

// The Responses/OpenAI schema validator requires an explicit JSON Schema type
// for every property. `const` alone is rejected by some compatible gateways.
const workerResultSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary'],
  properties: {
    status: { type: 'string', enum: ['ready'] },
    summary: { type: 'string', minLength: 1 }
  }
};
function coherentOutcome(task: AgentTask) { return task.capability === 'app:identity' ? 'A recognizable, launchable app identity with a serious app-specific SVG icon.' : 'A polished, usable vertical slice whose primary workflow and every visible local control work.'; }
function buildAcceptance(task: AgentTask, effort: EffortLevel) { const required = task.capability.startsWith('surface:') ? ['requested route is represented by a node.json in the app tree', ...(task.context?.acceptance ?? [])] : task.context?.acceptance ?? []; return { version: 1, goal: coherentOutcome(task), required, themes: effort === 'fast' ? [] : ['dark', 'light'], viewports: effort === 'fast' ? [] : [[760, 500], [1280, 800]], forbidBrokenAssets: true, forbidConsoleErrors: effort !== 'fast' }; }
const bridgeTypes = `interface VibeOSBridge { request(operation: unknown): Promise<unknown>; navigate(url: string, mode?: 'search_results' | 'destination'): Promise<unknown>; storage: { read(key: string): Promise<unknown>; write(key: string, value: unknown): Promise<unknown> }; dispatch(intent: unknown): Promise<unknown>; ai: { command(command: string, options?: { scope?: 'app'|'descendants'|'world'|{appId:string}; context?: unknown; output?: 'result'|'modify'|'navigate'|'generate' }): Promise<unknown> }; }\ndeclare global { interface Window { vibeOS: VibeOSBridge } }\nexport {};\n`;
const bridgeClient = `// window.vibeOS is injected by the generated-surface host. It includes storage, navigation, dispatch, and ai.command({scope,context,output}). Do not access parent DOM, open runtime sockets, or use ambient host APIs.\n`;
const themeContract = `:root{--vibe-surface:#191923;--vibe-raised:#242431;--vibe-control:#303044;--vibe-text:#f1f1f6;--vibe-muted:#aeb0c2;--vibe-border:#ffffff22;--vibe-accent:#a89dfc;color-scheme:dark}:root[data-theme="light"]{--vibe-surface:#f7f8fc;--vibe-raised:#fff;--vibe-control:#e8ebf3;--vibe-text:#20202b;--vibe-muted:#596070;--vibe-border:#20202b22;--vibe-accent:#6658cf;color-scheme:light}\n`;
const frameworkGuide = `# VibeOS capability worker\n\nRead the work order and acceptance files. Modify only output/app. Never put references to framework/, input/, output/, or the staged job into published HTML/CSS/JS; copy needed CSS/JS into output/app or use inline code. For app identity jobs, preserve the starter node.json, set a canonical non-empty title, create a valid drawable icon.svg with viewBox and visible geometry, and do not replace it with sparkle/emoji/Lucide/generic artwork. For surface jobs, publish the requested route through the node tree: update the node.json at that node with either an inline surface object or a valid relative entry file. For route /, the app-root node.json itself must expose the route; an unreferenced index.html is insufficient. A surface object uses this safe shape: {heading: string, body: string, controls: []}; controls is always an array, and each control has {id: string, label: string, intent: object}. Use [] when there are no controls. Preserve stable identity fields. Use direct file creation or small valid patches; a malformed patch is not a result. For normal pages, every visible control and primary workflow works now, with local assets, no overflow, semantic theme tokens, and valid node routes. Return the required structured result.\n`;
