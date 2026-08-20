import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.VIBEOS_LOG_FILE ?? fileURLToPath(new URL('../../dev.log', import.meta.url));
try { mkdirSync(dirname(file), { recursive: true }); } catch {}
export function log(scope: string, message: string, detail?: unknown) {
  const now = new Date(); const stamp = now.toISOString().slice(11, 23); const line = `${stamp} ${scope.padEnd(9)} ${message}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}\n`;
  process.stdout.write(line);
  try { appendFileSync(file, line); } catch (error) { process.stderr.write(`[logging] unable to write ${file}: ${String(error)}\n`); }
}
export function recentLog(lines = 80) {
  try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-lines).join('\n'); } catch { return ''; }
}
