import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import type { AgentTask, EffortLevel, SearchLevel, VibeOSSettings } from '@vibeos/shared';
import { buildCodexInvocation, createStagedJob, inspectExplicitReferences, modelName, publishCandidate, readStructuredWorkerResult, selectWorkerProfile, validateCandidateTree } from './generation-harness.js';

const appearance = { mode: 'dark' as const, backgroundMode: 'fill' as const, autoHideChromeOnMaximize: false, dockPosition: 'bottom' as const, uiTypeface: 'modern' as const, monoTypeface: 'modern' as const, displayScale: 'default' as const, notificationDuration: 20 };
const task = (target: string, effort: EffortLevel = 'quality', search: SearchLevel = 'none'): AgentTask => ({
  operationId: 'op-1', capability: 'surface:app-example:/', intent: { type: 'open_surface', appId: 'app-example', route: '/' }, input: {}, target,
  context: { settings: { model: 'terra', useGhPrefix: false, reasoning: 'high', effort, search, generationVisibility: 'completion', appearance } }
});

test('worker profiles use the selected base model and native reasoning efforts', () => {
  const expected: Array<[EffortLevel, string, string]> = [
    ['fast', 'gpt-5.6-terra', 'low'], ['balanced', 'gpt-5.6-terra', 'medium'],
    ['quality', 'gpt-5.6-terra', 'high'], ['ultra', 'gpt-5.6-terra', 'max']
  ];
  for (const [effort, model, reasoning] of expected) assert.deepEqual(selectWorkerProfile(effort), { effort, model, reasoning, repairBudget: effort === 'fast' ? 0 : effort === 'balanced' ? 1 : effort === 'quality' ? 2 : 3 });
  assert.equal(modelName('terra', false), 'gpt-5.6-terra');
  assert.equal(modelName('terra', true), 'gh/gpt-5.6-terra');
});

test('Codex invocation is contained, structured, and enables search only when selected', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-invocation-'));
  const staged = { root, resultSchema: join(root, 'schema.json'), resultFile: join(root, 'result.json') };
  const none = buildCodexInvocation(staged, selectWorkerProfile('quality', modelName('terra', true)), 'none', 'work', 'codex', { PATH: '/usr/bin', CODEX_HOME: '/codex-auth', OPENAI_API_KEY: 'test-key', SECRET_TOKEN: 'never-forward' });
  assert.deepEqual(none.args.slice(0, 3), ['-a', 'never', 'exec']);
  assert.ok(none.args.includes('gh/gpt-5.6-terra'));
  assert.ok(none.args.includes('model_reasoning_effort=high'));
  assert.ok(none.args.includes('workspace-write'));
  assert.ok(none.args.includes('--output-schema'));
  assert.ok(none.args.includes('--json'));
  assert.equal(none.args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(none.args.includes('--search'), false);
  assert.equal(buildCodexInvocation(staged, selectWorkerProfile('balanced'), 'online_info', 'work').args.includes('--search'), true);
  assert.equal(buildCodexInvocation(staged, selectWorkerProfile('balanced'), 'none', 'work', 'codex', process.env, true).args.includes('--search'), true);
  assert.deepEqual(Object.keys(none.env).sort(), ['CODEX_HOME', 'HOME', 'LANG', 'OPENAI_API_KEY', 'PATH', 'TMPDIR']);
  assert.equal(none.env.CODEX_HOME, '/codex-auth');
  assert.equal(none.env.OPENAI_API_KEY, 'test-key');
  assert.equal('SECRET_TOKEN' in none.env, false);
});

test('Codex invocation preserves the real Codex home when no override is configured', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-invocation-home-'));
  const staged = { root, resultSchema: join(root, 'schema.json'), resultFile: join(root, 'result.json') };
  const invocation = buildCodexInvocation(staged, selectWorkerProfile('balanced'), 'none', 'work', 'codex', { PATH: '/usr/bin' });
  assert.equal(invocation.env.HOME, process.env.HOME);
  assert.equal(invocation.env.CODEX_HOME, join(process.env.HOME ?? homedir(), '.codex'));
});

test('Codex invocation forwards OPENAI_API_KEY without forwarding unrelated secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-api-key-'));
  const staged = { root, resultSchema: join(root, 'schema.json'), resultFile: join(root, 'result.json') };
  const invocation = buildCodexInvocation(staged, selectWorkerProfile('balanced'), 'none', 'work', 'codex', {
    PATH: '/usr/bin', OPENAI_API_KEY: 'present', OTHER_SECRET: 'never-forward'
  });
  assert.equal(invocation.env.OPENAI_API_KEY, 'present');
  assert.equal('OTHER_SECRET' in invocation.env, false);
});

test('staging copies only the owned source subtree and excludes mutable data', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-stage-')); const world = join(root, 'world'); const live = join(world, 'apps', 'app-example');
  mkdirSync(join(live, 'data'), { recursive: true }); writeFileSync(join(live, 'node.json'), '{"id":"app-example"}'); writeFileSync(join(live, 'data', 'private.json'), 'secret');
  const staged = createStagedJob(task(live), { worldRoot: world, jobsRoot: join(world, '.jobs') });
  assert.equal(readFileSync(join(staged.outputApp, 'node.json'), 'utf8'), '{"id":"app-example"}');
  assert.equal(existsSync(join(staged.outputApp, 'data')), false);
  assert.equal(JSON.parse(readFileSync(staged.workOrder, 'utf8')).target.appId, 'app-example');
});

test("staged jobs contain a complete versioned worker kit and executable acceptance contract", () => {
  const root = mkdtempSync(join(tmpdir(), "vibeos-kit-")); const world = join(root, "world"); const live = join(world, "apps", "app-example");
  mkdirSync(live, { recursive: true }); writeFileSync(join(live, "node.json"), JSON.stringify({ id: "app-example", title: "Example", kind: "app", children: [] }));
  const staged = createStagedJob(task(live, "ultra", "online_content"), { worldRoot: world, jobsRoot: join(world, ".jobs") });
  assert.equal(existsSync(join(staged.framework, "bridge.d.ts")), true);
  assert.equal(existsSync(join(staged.framework, "bridge.js")), true);
  assert.equal(existsSync(join(staged.framework, "theme.css")), true);
  assert.equal(existsSync(join(staged.input, "acceptance.json")), true);
  assert.equal(existsSync(join(staged.input, "current-node", "node.json")), true);
  const order = JSON.parse(readFileSync(staged.workOrder, "utf8"));
  assert.equal(order.profile.model, "gpt-5.6-terra");
  assert.match(order.outcome, /usable/);
});

test('candidate validation rejects links and special filesystem objects', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-candidate-')); mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'node.json'), JSON.stringify({ id: 'app-example', title: 'Example', kind: 'app', children: [], surface: { heading: 'Example', body: '', controls: [] } }));
  assert.equal(validateCandidateTree(root).ok, true);
  const linked = join(root, 'linked'); symlinkSync(join(root, 'node.json'), linked);
  const result = validateCandidateTree(root);
  assert.equal(result.ok, false); if (!result.ok) assert.match(result.errors.join(' '), /symbolic link/);
});

test('publication replaces only the app source and preserves mutable data', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-publish-')); const live = join(root, 'world', 'apps', 'app-example'); const candidate = join(root, 'candidate');
  mkdirSync(join(live, 'data'), { recursive: true }); mkdirSync(candidate, { recursive: true });
  writeFileSync(join(live, 'node.json'), 'old'); writeFileSync(join(live, 'data', 'state.json'), 'kept'); writeFileSync(join(candidate, 'node.json'), 'new');
  publishCandidate(candidate, live);
  assert.equal(readFileSync(join(live, 'node.json'), 'utf8'), 'new');
  assert.equal(readFileSync(join(live, 'data', 'state.json'), 'utf8'), 'kept');
});

test('publication restores the previous app when post-publish loading fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-rollback-')); const live = join(root, 'world', 'apps', 'app-example'); const candidate = join(root, 'candidate');
  mkdirSync(live, { recursive: true }); mkdirSync(candidate, { recursive: true }); writeFileSync(join(live, 'node.json'), 'old'); writeFileSync(join(candidate, 'node.json'), 'new');
  assert.throws(() => publishCandidate(candidate, live, () => { throw new Error('not loadable'); }));
  assert.equal(readFileSync(join(live, 'node.json'), 'utf8'), 'old');
});

test('structured handoff does not accept a textual ready sentinel', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-result-')); const result = join(root, 'result.json');
  writeFileSync(result, 'VIBEOS_READY'); assert.throws(() => readStructuredWorkerResult(result));
  writeFileSync(result, JSON.stringify({ status: 'ready', summary: 'Capability completed.', statePatches: [], question: null, value: null }));
  assert.deepEqual(readStructuredWorkerResult(result), { status: 'ready', summary: 'Capability completed.', statePatches: [], value: null });
});

test('structured handoff accepts a bounded typed question but no waiting state patches', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-question-')); const result = join(root, 'result.json');
  writeFileSync(result, JSON.stringify({ status: 'needs_input', summary: 'Need a format.', statePatches: [], question: { kind: 'choices', title: 'Choose format', message: 'Which format?', choices: [{ id: 'json', label: 'JSON', description: null }], allowCustom: true }, value: null }));
  assert.deepEqual(readStructuredWorkerResult(result), { status: 'needs_input', summary: 'Need a format.', statePatches: [], value: null, question: { kind: 'choices', title: 'Choose format', message: 'Which format?', choices: [{ id: 'json', label: 'JSON' }], allowCustom: true } });
  writeFileSync(result, JSON.stringify({ status: 'needs_input', summary: 'Need a format.', statePatches: [{ appId: 'app-example', revision: 0, patch: [{ op: 'replace', path: '/x', value: '1' }] }], question: { kind: 'text', title: 'Name', message: 'Name it', placeholder: null, initial: null, multiline: false }, value: null }));
  assert.throws(() => readStructuredWorkerResult(result), /may not apply state patches/);
});

test('staging injects inherited memory and leaves current scope writable in output', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-memory-')); const world = join(root, 'world'); const live = join(world, 'apps', 'app-example');
  mkdirSync(live, { recursive: true }); writeFileSync(join(world, 'AGENT.md'), 'world memory'); writeFileSync(join(world, 'apps', 'AGENT.md'), 'apps memory'); writeFileSync(join(live, 'AGENT.md'), 'current memory'); writeFileSync(join(live, 'node.json'), '{"id":"app-example"}');
  const staged = createStagedJob(task(live), { worldRoot: world, jobsRoot: join(world, '.jobs') });
  assert.equal(readFileSync(join(staged.input, 'memory', '00-world.md'), 'utf8'), 'world memory');
  assert.equal(readFileSync(join(staged.input, 'memory', '01-apps.md'), 'utf8'), 'apps memory');
  assert.equal(readFileSync(join(staged.outputApp, 'AGENT.md'), 'utf8'), 'current memory');
});

test('explicit real references override search policy and are classified generically', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-reference-')); const file = join(root, 'sample.step'); writeFileSync(file, 'solid data');
  const referenced = { ...task(join(root, 'world', 'apps', 'app-editor')), input: { command: `Open ${file}, fetch https://example.com/spec and use three.js library` } };
  const refs = inspectExplicitReferences(referenced);
  assert.deepEqual(refs.urls, ['https://example.com/spec']);
  assert.equal(refs.forceSearch, true);
  assert.equal(refs.local[0]?.source, file);
  assert.ok(refs.libraries.some(name => name.toLowerCase().includes('three.js')));
  const browser = { ...referenced, capability: 'surface:browser:/example.com', input: { url: 'https://example.com' } };
  assert.deepEqual(inspectExplicitReferences(browser).urls, []);
});

test('explicit local files are copied into the isolated worker input', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-reference-stage-')); const world = join(root, 'world'); const live = join(world, 'apps', 'app-example');
  mkdirSync(live, { recursive: true }); writeFileSync(join(live, 'node.json'), '{"id":"app-example"}');
  const source = join(root, 'input.txt'); writeFileSync(source, 'host reference');
  const staged = createStagedJob({ ...task(live), input: { command: `inspect ${source}` } }, { worldRoot: world, jobsRoot: join(world, '.jobs') });
  const ref = staged.references.local[0]; assert.ok(ref);
  assert.equal(readFileSync(join(staged.root, ref.staged), 'utf8'), 'host reference');
  const order = JSON.parse(readFileSync(staged.workOrder, 'utf8'));
  assert.equal(order.references.local[0].staged, ref.staged);
});

test('structured state patches carry arbitrary JSON as text for strict gateways', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-result-patch-')); const result = join(root, 'result.json');
  writeFileSync(result, JSON.stringify({ status: 'ready', summary: 'Renamed file.', statePatches: [{ appId: 'app-editor', revision: 3, patch: [{ op: 'replace', path: '/tabs/0/id', value: '"hello.py"' }, { op: 'replace', path: '/meta', value: '{"dirty":false}' }] }], question: null, value: null }));
  assert.deepEqual(readStructuredWorkerResult(result).statePatches, [{ appId: 'app-editor', revision: 3, patch: [{ op: 'replace', path: '/tabs/0/id', value: 'hello.py' }, { op: 'replace', path: '/meta', value: { dirty: false } }] }]);
});

test('structured handoff returns an optional text value for a real in-app AI reply', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibeos-result-value-')); const result = join(root, 'result.json');
  writeFileSync(result, JSON.stringify({ status: 'ready', summary: 'Replied.', statePatches: [], question: null, value: 'Hello from the assistant.' }));
  assert.equal(readStructuredWorkerResult(result).value, 'Hello from the assistant.');
});
