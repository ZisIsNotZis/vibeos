import { spawn } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import type { AgentAdapter } from './runtime.js';
import type { AgentResult, AgentTask, SearchLevel } from '@vibeos/shared';
import { log } from './logging.js';
import { validateGeneratedWorld } from './world-contract.js';
import { verifyArtifact } from './artifact-verifier.js';
import { jobsRoot, worldRoot } from './paths.js';
import { buildCodexInvocation, createStagedJob, publishCandidate, readStructuredWorkerResult, selectWorkerProfile, updateJobRecord, validateCandidateTree } from './generation-harness.js';

const maxLogBytes = 4 * 1024 * 1024;

export class CodexAgentAdapter implements AgentAdapter {
  constructor(private readonly command = process.env.CODEX_BIN ?? 'codex') {}

  async fulfill(task: AgentTask): Promise<AgentResult> {
    if (!task.target.startsWith(worldRoot)) return { ok: false, message: 'This operation is outside the isolated VibeOS world.' };
    let staged: ReturnType<typeof createStagedJob>;
    try { staged = createStagedJob(task, { worldRoot, jobsRoot }); }
    catch (cause) { return { ok: false, message: cause instanceof Error ? cause.message : 'The generation job could not be staged.' }; }
    const settings = task.context?.settings; const profile = selectWorkerProfile(settings?.effort ?? 'quality', `gh/gpt-5.6-${settings?.model ?? 'terra'}` as any, settings?.reasoning ?? 'high'); const search = settings?.search ?? 'none';
    const invocation = buildCodexInvocation(staged, profile, search, buildPrompt(task, search), this.command);
    const eventsFile = `${staged.evidence}/events.jsonl`; const stderrFile = `${staged.evidence}/stderr.log`;
    log('codex', `job=${staged.id} ${task.capability} model=${profile.model} reasoning=${profile.reasoning} effort=${profile.effort} search=${search}`); log('codex', `command: ${invocation.command} ${invocation.args.map(arg => JSON.stringify(arg)).join(' ')}`); updateJobRecord(staged, 'running');
    let result = await workerSlots.run(() => runChild(invocation, eventsFile, stderrFile));
    if (!result.ok) { updateJobRecord(staged, 'failed', { error: result.message }); return result; }
    try {
      updateJobRecord(staged, 'verifying');
      let verificationErrors: string[] = [];
      for (let attempt = 0; attempt <= profile.repairBudget; attempt++) {
        readStructuredWorkerResult(staged.resultFile);
        const candidateCheck = validateCandidateTree(staged.outputApp);
        const verification = candidateCheck.ok ? await verifyArtifact(staged.outputApp, profile.effort, staged.evidence) : { ok: false, errors: candidateCheck.errors };
        verificationErrors = verification.errors;
        if (verification.ok) break;
        if (attempt === profile.repairBudget) throw new Error('Artifact verification failed: ' + verificationErrors.join('; '));
        writeFileSync(`${staged.input}/repair.json`, JSON.stringify({ attempt: attempt + 1, errors: verificationErrors }, null, 2) + '\n'); updateJobRecord(staged, 'repairing', { attempt: attempt + 1, errors: verificationErrors });
        const repairPrompt = task.capability === 'app:identity'
          ? 'Repair the identity artifact directly. Read input/repair.json and input/work-order.json. Ensure output/app/node.json is valid JSON with stable id, canonical non-empty title from identity.canonicalName, kind="app", and icon="icon.svg". Create output/app/icon.svg as a distinctive, recognizable app-specific drawable SVG derived from the requested app identity; never use generic sparkle, emoji, Lucide, placeholder, or unrelated artwork. Remove all references to framework/, input/, or staged paths from published files. Do not use malformed apply_patch syntax. Validate the files, then return the structured result.'
          : 'Repair output/app immediately. Read input/repair.json and input/work-order.json. Preserve working behavior, fix every reported defect, and ensure the requested route is represented by the correct node.json. For route /, the app-root node.json must define surface or a valid local entry; an unreferenced index.html is not loadable. Remove staged framework paths, recheck acceptance, and return the structured result.';
        const repair = buildCodexInvocation(staged, profile, search, repairPrompt, this.command);
        result = await workerSlots.run(() => runChild(repair, eventsFile, stderrFile)); if (!result.ok) { updateJobRecord(staged, 'failed', { error: result.message }); return result; }
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
      return { ok: true, capability: task.capability, files: candidate.files, result: worker };
    } catch (cause) {
      log('generation', `rejected job=${staged.id} error=${cause instanceof Error ? cause.message : String(cause)}`); updateJobRecord(staged, 'failed', { error: cause instanceof Error ? cause.message : String(cause) });
      return { ok: false, message: cause instanceof Error ? cause.message : 'The generated capability was rejected.' };
    }
  }
}

class WorkerSlots { private active = 0; private readonly waiting: Array<() => void> = []; constructor(private readonly limit: number) {} async run<T>(work: () => Promise<T>) { if (this.active >= this.limit) await new Promise<void>(resolve => this.waiting.push(resolve)); this.active++; try { return await work(); } finally { this.active--; this.waiting.shift()?.(); } } }
const workerSlots = new WorkerSlots(Math.max(1, Number(process.env.VIBEOS_GENERATION_CONCURRENCY ?? 2)));

function buildPrompt(task: AgentTask, search: SearchLevel) {
  const goal = task.capability === 'app:identity' ? 'Create a stable app identity and a serious, recognizable app-specific icon.svg derived from identity.requestedName and identity.canonicalName. The mark must communicate the app’s actual identity and visual language, never a generic sparkle, emoji, Lucide icon, or unrelated existing asset.' : 'Build the missing experientially complete capability requested by the work order.';
  const settings = task.context?.settings;
  return [
    'You are the VibeOS generated-world worker. Execute immediately; do not ask questions, narrate a plan, or wait for approval. Read input/work-order.json, input/acceptance.json, framework/FRAMEWORK.md, framework/bridge.d.ts, and framework/theme.css. Write only output/app. Deliver production-quality work first; return immediately only after the current page is genuinely complete and self-reviewed.',
    'The browser is presenting a real operating system. Never put VibeOS, Codex, imagine, generate, cache, placeholder, loading, or implementation language in user-facing copy. Treat the exact requested app, URL, route, and original action as authoritative. Never substitute a generic home page, prose card, setup acknowledgement, or “Explore further” loop for the requested experience.',
    'Always prioritize quality over speed. Effort controls scope and diligence, not permission to ship broken work: if a large feature cannot fit, ship a polished usable current-page slice and an explicit deferred AI command/action that can complete it later. Apps should be designed as extensible worlds with persistent state, child routes, local commands, and AI-backed commands where useful.',
    'World contract: node.json is the OS envelope. Preserve stable id/title/kind/icon and existing descendants/assets unless the requested change requires them. For a surface route, the exact route must be represented by the correct node.json. For route /, the app-root node.json itself must expose either an inline surface object or a valid local entry. Rich behavior belongs in a self-contained local HTML/CSS/JS entrypoint referenced by node.entry; an unreferenced HTML file is not a page.',
    'The VibeOS host owns the outer window frame, title bar, close/minimize/maximize buttons, dragging, resizing, focus, and loading state. Do not fake or duplicate OS window chrome inside generated content. The app entrypoint owns only its client area and must not intercept pointer events outside that client area.',
    goal,
    'Quality is page-scoped, not app-scoped: implement this page as a polished, coherent production slice. Every visible control must work now by page-local JavaScript, advance to a clearly implemented state, or navigate to a genuinely new lazy child surface. Do not defer the current page workflow. Forms must read current field values and update real result/content regions. Tabs must switch to materially different content while preserving the shared shell and active state. Buttons, menus, filters, checkboxes, radio buttons, keyboard shortcuts, pointer actions, drag/drop, game loops, and modal confirmations must have real state transitions—not dead controls, labels, toasts, or metadata.',
    'Use node.entry for any non-trivial app. A game must render its actual playable board/world and support its primary keyboard/pointer interaction with visible state updates. A calculator must implement arithmetic, clear, delete, decimal, keyboard input, and equals. An editor must look and behave like the requested editor with a real editable surface, file/tab selection, editing, save/new/find or equivalent primary workflow. A card/board app must render its real board and support its primary interactions. A website must have recognizable identity, expected layout, inputs, submit behavior, and useful result behavior. These are examples of the quality bar, not a closed application taxonomy.',
    'Do not produce a generic scaffold merely because the full application is large. Implement the requested page deeply and honestly; a smaller but functioning vertical slice is acceptable, while a visually polished static mock is not. Before delivery, inspect the generated files and run a focused smoke check for the page’s primary workflow. Fix failures before returning.',
    'Every visible icon/image must be a valid local asset or deliberate inline SVG. Generate serious recognizable app/site-specific artwork; never use generic sparkle, emoji, Lucide, unrelated assets, broken image URLs, or placeholder artwork. Keep assets and behavior inside the node-owned subtree.',
    'Avoid accidental horizontal/vertical overflow at ordinary window sizes using responsive sizing, min-width:0, max-width:100%, and contained scrolling only where product-appropriate. Use semantic theme tokens for all non-brand colors: primary/on-primary, surface/surface-raised/surface-variant, on-surface/on-surface-variant, outline, control, focus, error. Provide both dark and light token values via :root and [data-theme="light"] (or equivalent); never hard-code a dark-only shell. Style scrollbars consistently when scrolling is needed.',
    `Settings: model=${settings?.model ?? 'terra'}, reasoning=${settings?.reasoning ?? 'high'}, effort=${settings?.effort ?? 'quality'}, search=${settings?.search ?? search}.`,
    settings?.effort === 'fast' ? 'Effort fast: keep scope focused, but still implement a reasonable functioning page and do one primary-workflow smoke check.' : settings?.effort === 'balanced' ? 'Effort balanced: implement the complete page workflow and test its primary interactions.' : settings?.effort === 'ultra' ? 'Effort ultra: use maximum diligence, research if allowed, self-test broadly, inspect edge cases, and repair quality issues before delivery.' : 'Effort quality: prioritize production-quality UI and behavior over speed; self-review and smoke-test the primary workflow before delivery.',
    search === 'none' ? 'Do not browse or fetch online content.' : search === 'online_info' ? 'You may research factual information, but author the experience locally.' : 'You may use permitted online content or repositories as building material, vendor it locally, and record provenance/licenses where relevant.',
    'For output=modify, return value.updatedContent when the command changes a live document or selection so the app can apply it immediately. Do not access paths outside this staged job. Return only the structured result required by input/result.schema.json after the files are actually complete.'
  ].join('\n');
}

function runChild(invocation: ReturnType<typeof buildCodexInvocation>, eventsFile: string, stderrFile: string): Promise<AgentResult> {
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
      for (const line of lines.filter(Boolean)) logCodexEvent(line);
    });
    child.stderr.on('data', chunk => { const text = chunk.toString(); stderrTail = (stderrTail + text).slice(-16_000); if (errorBytes < maxLogBytes) { const kept = text.slice(0, maxLogBytes - errorBytes); appendFileSync(stderrFile, kept); errorBytes += Buffer.byteLength(kept); } for (const line of text.trim().split('\n').filter(Boolean)) log('codex:err', line); });
    child.on('error', cause => finish({ ok: false, message: `Codex could not start: ${cause.message}` }));
    child.on('close', code => {
      if (stdoutRemainder.trim()) logCodexEvent(stdoutRemainder);
      finish(code === 0 ? { ok: true, capability: 'staged' } : { ok: false, message: stderrTail.trim() || 'The requested capability could not be prepared.' });
    });
  });
}

function logCodexEvent(line: string) {
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
  } catch {
    log('codex', line);
  }
}
