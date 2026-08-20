import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppStateSnapshot, JsonPatchOperation } from '@vibeos/shared';

export function readAppState(root: string, appId: string): AppStateSnapshot {
  const path = statePath(root, appId);
  try { const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppStateSnapshot>; return { appId, revision: Number.isSafeInteger(value.revision) ? value.revision! : 0, state: value.state ?? {} }; }
  catch { return { appId, revision: 0, state: {} }; }
}

export function writeAppState(root: string, appId: string, state: unknown, expectedRevision?: number): AppStateSnapshot {
  const current = readAppState(root, appId);
  if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new Error('App state changed; reload before writing.');
  const next = { appId, revision: current.revision + 1, state: structuredClone(state) };
  const path = statePath(root, appId); mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`; writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n'); renameSync(temporary, path);
  return next;
}

export function patchAppState(root: string, appId: string, patch: JsonPatchOperation[], expectedRevision?: number): AppStateSnapshot {
  const current = readAppState(root, appId);
  if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new Error('App state changed; reload before applying this change.');
  const state = structuredClone(current.state);
  for (const operation of patch) apply(state, operation);
  return writeAppState(root, appId, state, current.revision);
}

function apply(root: unknown, operation: JsonPatchOperation) {
  if (!operation.path.startsWith('/') || operation.path.includes('//')) throw new Error('Invalid state patch path.');
  const parts = operation.path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent: any = root;
  for (const part of parts.slice(0, -1)) { if (!parent || typeof parent !== 'object' || !(part in parent)) throw new Error(`State patch path does not exist: ${operation.path}`); parent = parent[part]; }
  const key = parts.at(-1)!;
  if (!parent || typeof parent !== 'object') throw new Error(`State patch parent does not exist: ${operation.path}`);
  if (operation.op === 'remove') { if (!(key in parent)) throw new Error(`State patch path does not exist: ${operation.path}`); Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key]; return; }
  if (operation.op === 'replace' && !(key in parent)) throw new Error(`State patch path does not exist: ${operation.path}`);
  if (Array.isArray(parent) && key === '-') parent.push(structuredClone(operation.value)); else parent[key] = structuredClone(operation.value);
}
function statePath(root: string, appId: string) { if (!/^[a-zA-Z0-9_-]+$/.test(appId)) throw new Error('Invalid app state identifier.'); return join(root, 'apps', appId, 'data', 'state.json'); }
