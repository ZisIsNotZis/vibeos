import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'vibeos-e2e-'));
const source = resolve(import.meta.dirname, '../../../world');
const world = join(root, 'world');
cpSync(source, world, { recursive: true, filter: path => !path.includes('/.jobs') && !path.endsWith('.runtime-state.json') });
const child = spawn('npm', ['run', 'dev', '--workspace', '@vibeos/server'], { cwd: resolve(import.meta.dirname, '../../..'), stdio: 'inherit', env: { ...process.env, VIBEOS_AGENT_MODE: 'deterministic', VIBEOS_WORLD_ROOT: world, VIBEOS_STATE_FILE: join(root, 'state.json'), VIBEOS_JOBS_ROOT: join(root, 'jobs') } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
