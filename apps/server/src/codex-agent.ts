import { spawn } from 'node:child_process';
import type { AgentAdapter } from './runtime.js';
import type { AgentResult, AgentTask } from '@vibeos/shared';
import { log } from './logging.js';

export class CodexAgentAdapter implements AgentAdapter {
  constructor(private readonly workspace = process.env.VIBEOS_WORKSPACE ?? process.cwd(), private readonly command = process.env.CODEX_BIN ?? 'codex') {}
  fulfill(task: AgentTask): Promise<AgentResult> {
    const prompt = ['You are the generated-world worker inside VibeOS.', 'Generate only the requested app/surface cache artifact, as fast as possible, and return control immediately when complete.', 'The core runtime is already running. Treat source code as immutable. Write only JSON/SVG/assets below the exact target cache path. Do not edit TypeScript, React, package files, tests, configs, or any file outside the target cache path. Do not run formatters or broad refactors.', 'Return a complete structured surface artifact and end your response with exactly: VIBEOS_READY.', `Capability: ${task.capability}`, `Target cache path: ${task.target}`, `Original intent: ${JSON.stringify(task.intent)}`, `Input: ${JSON.stringify(task.input)}`].join('\n');
    return new Promise(resolve => { log('codex', `starting capability=${task.capability} operation=${task.operationId}`); const child = spawn(this.command, ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--cd', this.workspace, prompt], { cwd: this.workspace, stdio: ['ignore', 'pipe', 'pipe'] }); let output = ''; let error = ''; let settled = false; const finish = (result: AgentResult) => { if (!settled) { settled = true; resolve(result); } }; child.stdout.on('data', chunk => { const text = chunk.toString(); output += text; log('codex', text.trim()); }); child.stderr.on('data', chunk => { const text = chunk.toString(); error += text; log('codex:err', text.trim()); }); child.on('error', cause => finish({ ok: false, message: `Codex could not start: ${cause.message}` })); child.on('close', code => { log('codex', `exited code=${code}`); finish(code === 0 && output.includes('VIBEOS_READY') ? { ok: true, capability: task.capability } : { ok: false, message: error.trim() || 'The requested capability could not be prepared.' }); }); });
  }
}
