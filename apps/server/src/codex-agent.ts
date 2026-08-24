import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AgentAdapter } from './runtime.js';
import type { AgentResult, AgentTask, SearchLevel } from '@vibeos/shared';
import { log } from './logging.js';
import { validateGeneratedWorld } from './world-contract.js';
import { verifyArtifact } from './artifact-verifier.js';
import { jobsRoot, worldRoot } from './paths.js';
import { buildCodexInvocation, createStagedJob, modelName, publishCandidate, readStructuredWorkerResult, selectWorkerProfile, updateJobRecord, validateCandidateTree } from './generation-harness.js';

const maxLogBytes = 4 * 1024 * 1024;

export type AgentProgress = { taskId: string; title: string; kind: 'begin' | 'message' | 'tool_call' | 'reason' | 'end'; text: string; status?: 'active' | 'success' | 'error' };
export class CodexAgentAdapter implements AgentAdapter {
  private readonly paused = new Map<string, { staged: ReturnType<typeof createStagedJob>; task: AgentTask; profile: ReturnType<typeof selectWorkerProfile>; search: SearchLevel; title: string }>();
  constructor(private readonly command = process.env.CODEX_BIN ?? 'codex', private readonly onProgress?: (event: AgentProgress) => void) {}

  async fulfill(task: AgentTask): Promise<AgentResult> {
    if (!task.target.startsWith(worldRoot)) return { ok: false, message: 'This operation is outside the isolated VibeOS world.' };
    let staged: ReturnType<typeof createStagedJob>;
    try { staged = createStagedJob(task, { worldRoot, jobsRoot }); }
    catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : 'The generation job could not be staged.' }; }
    const settings = task.context?.settings; const profile = selectWorkerProfile(settings?.effort ?? 'quality', modelName(settings?.model ?? 'terra', settings?.useGhPrefix ?? false), settings?.reasoning ?? 'high'); const search = settings?.search ?? 'none';
    return this.run(staged, task, profile, search, taskTitle(task), buildPrompt(task, search, staged));
  }
  async resume(questionId: string, answer: string): Promise<AgentResult> {
    const paused = this.paused.get(questionId); if (!paused) return { ok: false, message: 'The requested generation question has expired.' };
    this.paused.delete(questionId);
    writeFileSync(`${paused.staged.input}/answer.json`, JSON.stringify({ questionId, answer, answeredAt: new Date().toISOString() }) + '\n');
    return this.run(paused.staged, paused.task, paused.profile, paused.search, paused.title, 'Continue the same staged job immediately. Read input/work-order.json, input/answer.json, input/memory, framework/FRAMEWORK.md, and the existing output/app. The user answer resolves your pending question. Complete and self-check the requested work now. Return the required structured result.');
  }
  private async run(staged: ReturnType<typeof createStagedJob>, task: AgentTask, profile: ReturnType<typeof selectWorkerProfile>, search: SearchLevel, title: string, prompt: string): Promise<AgentResult> {
    const invocation = buildCodexInvocation(staged, profile, search, prompt, this.command, process.env, staged.references.forceSearch);
    const eventsFile = `${staged.evidence}/events.jsonl`; const stderrFile = `${staged.evidence}/stderr.log`;
    log('codex', `job=${staged.id} ${task.capability} model=${profile.model} reasoning=${profile.reasoning} effort=${profile.effort} search=${search}`); log('codex', `command: ${invocation.command} ${invocation.args.map(arg => JSON.stringify(arg)).join(' ')}`); updateJobRecord(staged, 'running'); this.progress({ taskId: task.operationId, title, kind: 'begin', text: 'Working…', status: 'active' });
    let result = await workerSlots.run(() => runChild(invocation, eventsFile, stderrFile, event => this.progress({ taskId: task.operationId, title, ...event, status: 'active' })));
    if (!result.ok) { updateJobRecord(staged, 'failed', { error: result.message }); this.progress({ taskId: task.operationId, title, kind: 'end', text: result.message, status: 'error' }); return result; }
    try {
      const initial = readStructuredWorkerResult(staged.resultFile);
      if (initial.status === 'needs_input') {
        const questionId = randomUUID();
        this.paused.set(questionId, { staged, task, profile, search, title });
        updateJobRecord(staged, 'waiting_input', { questionId, question: initial.question, summary: initial.summary });
        this.progress({ taskId: task.operationId, title, kind: 'end', text: initial.summary, status: 'success' });
        return { ok: true, capability: task.capability, result: { status: 'needs_input', summary: initial.summary, questionId, question: initial.question } };
      }
      updateJobRecord(staged, 'verifying');
      let verificationErrors: string[] = [];
      for (let attempt = 0; attempt <= profile.repairBudget; attempt++) {
        const handoff = readStructuredWorkerResult(staged.resultFile);
        if (handoff.status !== 'ready') throw new Error('Worker requested additional input during verification.');
        const candidateCheck = validateCandidateTree(staged.outputApp);
        const verification = candidateCheck.ok ? await verifyArtifact(staged.outputApp, profile.effort, staged.evidence) : { ok: false, errors: candidateCheck.errors };
        verificationErrors = verification.errors;
        if (verification.ok) break;
        if (attempt === profile.repairBudget) throw new Error('Artifact verification failed: ' + verificationErrors.join('; '));
        writeFileSync(`${staged.input}/repair.json`, JSON.stringify({ attempt: attempt + 1, errors: verificationErrors }, null, 2) + '\n'); updateJobRecord(staged, 'repairing', { attempt: attempt + 1, errors: verificationErrors });
        const repairPrompt = task.capability === 'app:identity'
          ? 'Repair the identity artifact directly. Read input/repair.json and input/work-order.json. Ensure output/app/node.json is valid JSON with stable id, canonical non-empty title from identity.canonicalName, kind="app", and icon="icon.svg". Create output/app/icon.svg as a distinctive, recognizable app-specific drawable SVG derived from the requested app identity; never use generic sparkle, emoji, Lucide, placeholder, or unrelated artwork. Remove all references to framework/, input/, or staged paths from published files. Do not use malformed apply_patch syntax. Validate the files, then return the structured result.'
          : 'Repair output/app immediately. Read input/repair.json and input/work-order.json. Preserve working behavior, fix every reported defect, and ensure the requested route is represented by the correct node.json. For route /, the app-root node.json must define surface or a valid local entry; an unreferenced index.html is not loadable. Remove staged framework paths, recheck acceptance, and return the structured result.';
        const repair = buildCodexInvocation(staged, profile, search, repairPrompt, this.command, process.env, staged.references.forceSearch);
        result = await workerSlots.run(() => runChild(repair, eventsFile, stderrFile, event => this.progress({ taskId: task.operationId, title, ...event, status: 'active' }))); if (!result.ok) { updateJobRecord(staged, 'failed', { error: result.message }); this.progress({ taskId: task.operationId, title, kind: 'end', text: result.message, status: 'error' }); return result; }
      }
      const candidate = validateCandidateTree(staged.outputApp); if (!candidate.ok) throw new Error(`Candidate rejected: ${candidate.errors.join('; ')}`);
      const candidateWorld = `${staged.root}/candidate-world`; writeFileSync(`${staged.evidence}/candidate.json`, JSON.stringify(candidate, null, 2) + '\n');
      mkdirSync(`${candidateWorld}/apps`, { recursive: true }); cpSync(staged.outputApp, `${candidateWorld}/apps/${staged.appId}`, { recursive: true });
      const check = validateGeneratedWorld(candidateWorld, { ...task, target: `${candidateWorld}/apps/${staged.appId}` });
      if (!check.ok) throw new Error(`Generated world rejected: ${check.errors.join('; ')}`);
      publishCandidate(staged.outputApp, staged.liveTarget, target => {
        const published = validateGeneratedWorld(worldRoot, { ...task, target });
        if (!published.ok) throw new Error(`Published capability could not be loaded: ${published.errors.join('; ')}`);
      });
      log('generation', `published job=${staged.id} files=${candidate.files.length} bytes=${candidate.bytes}`); updateJobRecord(staged, 'published', { files: candidate.files, bytes: candidate.bytes });
      const worker = readStructuredWorkerResult(staged.resultFile);
      this.progress({ taskId: task.operationId, title, kind: 'end', text: worker.summary, status: 'success' }); return { ok: true, capability: task.capability, files: candidate.files, result: worker };
    } catch (cause) {
      log('generation', `rejected job=${staged.id} error=${cause instanceof Error ? cause.message : String(cause)}`); updateJobRecord(staged, 'failed', { error: cause instanceof Error ? cause.message : String(cause) });
      const message = cause instanceof Error ? cause.message : 'The generated capability was rejected.'; this.progress({ taskId: task.operationId, title, kind: 'end', text: message, status: 'error' }); return { ok: false, message };
    }
  }
  private progress(event: AgentProgress) { this.onProgress?.(event); }
}

class WorkerSlots { private active = 0; private readonly waiting: Array<() => void> = []; constructor(private readonly limit: number) {} async run<T>(work: () => Promise<T>) { if (this.active >= this.limit) await new Promise<void>(resolve => this.waiting.push(resolve)); this.active++; try { return await work(); } finally { this.active--; this.waiting.shift()?.(); } } }
const workerSlots = new WorkerSlots(Math.max(1, Number(process.env.VIBEOS_GENERATION_CONCURRENCY ?? 2)));

const fixedPrompt = `You are the VibeOS generated-world worker. Execute immediately; do not narrate a plan or wait for approval. Read framework/FRAMEWORK.md, framework/bridge.d.ts, framework/theme.css, input/acceptance.json, the compact task JSON below, and inherited AGENTS memory. Write only output/app. If input/observation/window.png exists, inspect it when visual state matters, but prefer declared state/contracts for semantic truth. Deliver production-quality work and return only after the current page is genuinely complete and self-reviewed.

The browser presents a real operating system. Treat the exact requested app, URL, route, original action, and real-world request literally. Never put VibeOS, Codex, imagine, generate, cache, placeholder, loading, or implementation language in user-facing copy. Never substitute a generic home page, prose card, setup acknowledgement, “Explore further” loop, simulation, explanation, or internal-only state change for the requested experience. If a request reaches beyond the generated page or VibeOS state, carry out the corresponding real operation through an approved bridge or host capability, verify the observable result, and expose the concrete failure or ask for missing input/permission if it is unavailable—never claim success.

Always prioritize quality over speed. Effort controls scope and diligence, not permission to ship broken work. If a large feature cannot fit, ship a polished usable current-page slice and an explicit deferred AI command/action that can complete later; never defer the current page’s primary workflow. Apps are extensible worlds: design for persistent state, child routes, local commands, and AI-backed commands where useful.

World contract: node.json is the OS envelope. Preserve stable id/title/kind/icon, existing descendants, assets, routes, state shape, and working workflows unless requested otherwise. The exact requested surface route must be represented by its correct node.json. For route /, the app-root node.json itself must expose an inline surface or valid local entry. Use node.entry for any non-trivial app; an unreferenced HTML file is not a page. Rich behavior belongs in a self-contained local HTML/CSS/JS entrypoint inside the node-owned subtree.

The VibeOS host owns the outer window frame, title bar, close/minimize/maximize buttons, dragging, resizing, focus, loading state, global shortcuts, command palette, and Chinese IME. Do not duplicate or fake OS chrome and do not intercept pointer events outside the app client area. Generated content owns its client-area visual design, behavior, commands, child layout, state schema, and persistence policy.

Quality is page-scoped, not app-scoped, and lazy execution is a delivery strategy—not permission to fake interaction. Generate only the current page now, but make every visible control work through page-local JavaScript, a real child-surface transition/generation, or a real AI-backed command: deterministic current-page behavior stays local; use window.vibeOS.dispatch({type:'open_surface',appId,route}) or equivalent bridge navigation for a child page; use window.vibeOS.ai.command(command,{scope,output}) for open-ended behavior. Choose the command output for the user-visible contract: output=result returns actual answer/artifact/data to this page, output=navigate opens or generates a concrete child surface, output=modify changes declared world/state, and output=generate requests a concrete generated artifact/result. Do not use navigate merely to acknowledge a request, or result merely to claim future work exists.

When the app/page is meant to create, generate, edit, transform, analyze, or export something, treat that purpose as the primary workflow even if the request is only a name or short description. The current page must expose the smallest complete input→action→observable-result loop: collect relevant input, invoke the local implementation or AI command with that input and necessary state, then render the returned result or open the concrete next surface. A decorative preview, sample output, status change, acknowledgement, or generic dashboard is not a result. If the complete domain is large, implement a serious usable slice of the real domain and make its main action produce a concrete result now; defer only additional breadth behind a real child surface or AI command. This applies generically to any creator/editor/generator, not to a fixed list of app types.

The user must always get a real state transition, generation request, or concrete failure/question—not a status-label change, success toast, dialog close, metadata/acknowledgement screen, or claim that future work exists. Controls named Play/Start/Open/Continue/Next/Submit/Save or equivalent must perform their literal operation or hand off appropriately, never trap the user on the current page. Forms must read current values and update real result/content regions. Tabs must switch to materially different content while preserving their shared shell and active state. Menus, filters, checkboxes, radios, keyboard shortcuts, pointer actions, drag/drop, game loops, and modal confirmations need real state transitions. A game must render its actual playable board/world and primary keyboard/pointer interaction; an editor needs a real editable surface and primary file/tab/edit/save/find workflow; a website needs recognizable identity, expected layout, inputs, submit behavior, and useful results. These examples set the quality bar and are not a closed taxonomy.

For 2D/3D graphics and games, deliver a believable playable vertical slice, not a map-shaped mockup or dead buttons. Establish the real scene/view (Canvas/WebGL/SVG or a proven engine/library), camera and coordinate system, responsive viewport, render/update loop, input mapping, entities, collision/rules, feedback, HUD/overlays, pause/restart/exit flow, and persistent progress required by the requested page. A game action must change the simulated world and visibly update it; navigation must open a real child surface or invoke an AI command that can build it. Use coherent composition, depth/layers, lighting/material/animation where relevant, readable controls, aspect-correct geometry, and intentional assets/icons. For editors and visual tools, make the canvas genuinely editable with expected selection, pan/zoom, keyboard/pointer, undo/redo or save behavior for the current slice. Prefer a smaller complete loop over decorative breadth; deferred complexity needs a concrete next action. Self-test the primary input loop, resize/viewport behavior, restart/exit, and one error or edge path before handoff.

Do not produce a generic scaffold merely because the full application is large. Implement the requested page deeply and honestly: a smaller functioning vertical slice is acceptable, a polished static mock is not. Inspect existing code before editing. Preserve unrelated visual identity and behavior; do not replace an entrypoint for a localized feature unless necessary. Before returning, inspect generated files, exercise the requested primary flow and one related/pre-existing flow, and fix failures.

Every visible icon/image must be a valid local asset or deliberate inline SVG. Generate serious recognizable app/site-specific artwork; never use generic sparkle, emoji, Lucide, unrelated assets, broken image URLs, or placeholder artwork. Keep assets and behavior inside the node-owned subtree. Markdown/code surfaces should use available core rendering/highlighting support or a proven permitted library rather than an improvised weak parser.

Avoid accidental horizontal/vertical overflow at ordinary window sizes: use responsive sizing, min-width:0, max-width:100%, and contained overflow:auto where appropriate. Use semantic theme tokens for all non-brand colors and typography: primary/on-primary, surface/surface-raised/surface-variant, on-surface/on-surface-variant, outline, control, focus, error; font-ui/font-mono; caption/label/body/title/heading/display sizes; line-tight/line-normal. The host may supply dark, light, desert, future themes, font choices, and display scale; use framework/theme.css and supplied tokens. Never hard-code a dark-only shell, arbitrary ordinary UI font family, ordinary UI size, or ordinary UI color. Brand marks, game HUDs, and code editors may deliberately differ but should inherit supplied family/scale when practical. Style scrollbars consistently when scrolling is needed.

AI commands receive focused app state plus a compact world index. For a state-only request, return statePatches using the supplied revision and RFC-6902 add/replace/remove paths; do not edit source files. The runtime validates, persists, and broadcasts patches so visible apps refresh. Persist the smallest complete state and never overwrite unrelated fields. Change source only when the request adds or repairs capabilities beyond declared state. If input.output is result, answer in value, use statePatches:[], and leave source unchanged unless explicitly asked. If a material user choice blocks quality, return needs_input with no patches and a typed choices/text question; otherwise do not ask. Never substitute a canned local answer for requested AI work. Do not access paths outside this staged job. Return the required structured result only after files and behavior are complete.

For app identity jobs, preserve the starter node, set a canonical non-empty title, and create a valid drawable icon.svg with visible geometry derived from the requested identity—not generic artwork. For real browser/host operations, use the available approved mechanism; for export, use standard browser download mechanisms. If unavailable, state the limit or ask permission rather than simulating success.`;

const effortPrompt: Record<'fast' | 'balanced' | 'quality' | 'ultra', string> = {
  fast: 'EFFORT fast: focus scope tightly; still deliver a reasonable working page, test its primary workflow once, and do not ship visible dead behavior.',
  balanced: 'EFFORT balanced: complete the page workflow, test primary interactions and one related path, and fix discovered issues before return.',
  quality: 'EFFORT quality: prioritize production-quality UI, behavior, accessibility, persistence, responsive layout, and theme compatibility over speed; self-review and smoke-test before return.',
  ultra: 'EFFORT ultra: use maximum diligence; research when permitted, inspect edge cases, test broadly across workflows/themes/viewports, and repair every discovered quality issue before return.'
};

const searchPrompt: Record<SearchLevel, string> = {
  none: 'SEARCH none: do not browse, fetch, install, or use online information/content unless the task explicitly names a real URL, local/host path, or library; explicit references always require inspection/use.',
  online_info: 'SEARCH online_info: actively research for factual accuracy instead of guessing. Search permitted online sources (search, curl, gh, repositories) and inspect every explicitly referenced local/host file or real URL; use findings as guidance while authoring locally. Explicit references and explicitly requested libraries override this setting.',
  online_content: 'SEARCH online_content: actively research and reuse proven solutions. Inspect explicitly referenced local/host files and real URLs; prefer maintained packages, repositories, binaries, Python modules, and existing implementations over re-inventing complex functionality, while keeping the smallest elegant implementation that remains complete. Test reused components and record required provenance/license/setup. Explicit references and explicitly requested libraries override this setting.'
};

function readMemoryBlock(staged: ReturnType<typeof createStagedJob>) {
  try {
    return readdirSync(join(staged.input, 'memory')).filter(name => name.endsWith('.md')).sort().map(name => `--- ${name} ---\n${readFileSync(join(staged.input, 'memory', name), 'utf8')}`).join('\n');
  } catch { return ''; }
}

function compactJsonBlock(task: AgentTask, search: SearchLevel, staged: ReturnType<typeof createStagedJob>) {
  const settings = task.context?.settings;
  const context = task.context && Object.fromEntries(Object.entries({ node: task.context.node, parent: task.context.parent, siblings: task.context.siblings, existingFiles: task.context.existingFiles, acceptance: task.context.acceptance, observation: task.context.observation ? { ...task.context.observation, path: 'input/observation/window.png' } : undefined }).filter(([, value]) => value !== undefined));
  return JSON.stringify({ v: 2, operationId: task.operationId, capability: task.capability, intent: task.intent, input: task.input, context, target: { appId: staged.appId, output: 'output/app' }, settings: settings ? { model: settings.model, useGhPrefix: settings.useGhPrefix, reasoning: settings.reasoning, effort: settings.effort, search: settings.search } : { model: 'terra', useGhPrefix: false, reasoning: 'high', effort: 'quality', search }, references: staged.references, identity: task.capability === 'app:identity' ? { ...(task.input as object), canonicalName: String((task.input as { name?: unknown }).name ?? staged.appId).trim() } : undefined }, (_, value) => value === undefined ? undefined : value);
}

export function buildPrompt(task: AgentTask, search: SearchLevel, staged: ReturnType<typeof createStagedJob>) {
  const goal = task.capability === 'app:identity' ? 'GOAL: create a stable app identity and serious recognizable app-specific icon.svg; never use generic sparkle, emoji, Lucide, placeholder, or unrelated art.' : 'GOAL: build the requested experientially complete capability.';
  const settings = task.context?.settings;
  const memory = readMemoryBlock(staged);
  return ['[FIXED VibeOS WORK CONTRACT]\n' + fixedPrompt + '\n' + goal + '\nStructured handoff: return only input/result.schema.json. Ordinary completion is ready with statePatches:[] question:null value:null. State patches include appId, revision, RFC-6902 add/replace/remove operations, and JSON-text values. Persist only the smallest complete app state; never overwrite unrelated fields. A material blocking choice may return needs_input with no patches and a typed choices/text question; otherwise do not ask.',
    '[ACTIVE EFFORT POLICY]\n' + effortPrompt[settings?.effort ?? 'quality'],
    '[ACTIVE SEARCH POLICY]\n' + searchPrompt[search] + (staged.references.forceSearch ? '\nEXPLICIT REFERENCE OVERRIDE: inspect input/references and query the named real URLs/libraries now, regardless of the selected search level. A VibeOS browser route is not a real-world URL request.' : ''),
    '[INHERITED AGENTS MEMORY]\n' + (memory || '(none)'),
    '[TASK JSON]\n' + compactJsonBlock(task, search, staged)].join('\n\n');
}

function taskTitle(task: AgentTask) { const app = typeof task.input === 'object' && task.input && 'name' in task.input ? String((task.input as { name?: unknown }).name ?? '') : task.target.split('/').at(-1)?.replace(/^app-/, '').replace(/[-_]+/g, ' ') ?? 'System'; const action = task.capability === 'app:identity' ? 'Install' : task.capability.startsWith('ai:command') ? 'Command' : task.capability.startsWith('surface:') ? 'Open' : task.capability.startsWith('repair:') ? 'Repair' : 'Update'; return `${app || 'System'} — ${action}`; }
function runChild(invocation: ReturnType<typeof buildCodexInvocation>, eventsFile: string, stderrFile: string, onEvent?: (event: Pick<AgentProgress, 'kind' | 'text'>) => void): Promise<AgentResult> {
  return new Promise(resolve => {
    const child = spawn(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false; let eventBytes = 0; let errorBytes = 0; let stderrTail = '';
    const finish = (result: AgentResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} finish({ ok: false, message: 'Generation timed out.' }); }, Number(process.env.VIBEOS_GENERATION_TIMEOUT_MS ?? 15 * 60_000));
    let stdoutRemainder = '';
    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      if (eventBytes < maxLogBytes) { const kept = text.slice(0, maxLogBytes - eventBytes); appendFileSync(eventsFile, kept); eventBytes += Buffer.byteLength(kept); }
      stdoutRemainder += text;
      const lines = stdoutRemainder.split('\n'); stdoutRemainder = lines.pop() ?? '';
      for (const line of lines.filter(Boolean)) logCodexEvent(line, onEvent);
    });
    child.stderr.on('data', chunk => { const text = chunk.toString(); stderrTail = (stderrTail + text).slice(-16_000); if (errorBytes < maxLogBytes) { const kept = text.slice(0, maxLogBytes - errorBytes); appendFileSync(stderrFile, kept); errorBytes += Buffer.byteLength(kept); } for (const line of text.trim().split('\n').filter(Boolean)) log('codex:err', line); });
    child.on('error', cause => finish({ ok: false, message: `Codex could not start: ${cause.message}` }));
    child.on('close', code => {
      if (stdoutRemainder.trim()) logCodexEvent(stdoutRemainder, onEvent);
      finish(code === 0 ? { ok: true, capability: 'staged' } : { ok: false, message: stderrTail.trim() || 'The requested capability could not be prepared.' });
    });
  });
}

function logCodexEvent(line: string, onEvent?: (event: Pick<AgentProgress, 'kind' | 'text'>) => void) {
  // Keep the exact JSON in evidence/events.jsonl; dev.log gets a readable
  // trajectory line in addition to it. This makes tool calls and failures
  // visible during `npm run dev` without requiring a separate viewer.
  try {
    const event = JSON.parse(line) as Record<string, any>;
    const type = String(event.type ?? 'event');
    const item = event.item as Record<string, any> | undefined;
    const detail = item ?? event.error ?? event;
    const summary = typeof detail === 'string' ? detail : JSON.stringify(detail);
    log('codex:trajectory', `${type} ${summary}`);
    if (type === 'item.started' && item?.type === 'command_execution') onEvent?.({ kind: 'tool_call', text: JSON.stringify({ tool: 'command_execution', command: item.command }) });
    else if (type === 'item.completed' && item?.type === 'reasoning' && typeof item.text === 'string' && item.text.trim() && item.text !== '✨') onEvent?.({ kind: 'reason', text: item.text });
    else if (type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') onEvent?.({ kind: 'message', text: item.text });
    else if (type === 'turn.failed') onEvent?.({ kind: 'message', text: typeof event.error?.message === 'string' ? event.error.message : summary });
  } catch {
    log('codex', line);
  }
}
