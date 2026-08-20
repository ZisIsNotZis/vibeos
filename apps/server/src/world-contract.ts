import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { AgentTask } from '@vibeos/shared';
import { loadWorld } from './world-loader.js';

export type ContractResult = { ok: true } | { ok: false; errors: string[] };

/** Validates the small OS envelope without imposing an application taxonomy. */
export function validateGeneratedWorld(root: string, task: AgentTask): ContractResult {
  const target = resolve(task.target);
  const world = resolve(root);
  if (target !== world && !target.startsWith(`${world}/`)) return { ok: false, errors: ['target must remain inside world/'] };
  const appRoot = task.capability === 'app:identity' ? target : findAppRoot(world, target);
  if (!appRoot) return { ok: false, errors: ['target app workspace does not exist'] };
  const nodePath = join(appRoot, 'node.json');
  if (!existsSync(nodePath)) return { ok: false, errors: [`missing ${relative(world, nodePath)}`] };
  let node: Record<string, unknown>;
  try { node = JSON.parse(readFileSync(nodePath, 'utf8')) as Record<string, unknown>; } catch { return { ok: false, errors: ['node.json is not valid JSON'] }; }
  if (typeof node.id !== 'string' || !node.id) return { ok: false, errors: ['node.id must be a stable non-empty string'] };
  if (typeof node.title !== 'string' || !node.title) return { ok: false, errors: ['node.title must be a non-empty string'] };
  if (typeof node.kind !== 'string' || !node.kind) return { ok: false, errors: ['node.kind must be a non-empty string'] };
  const surfaceEntry = node.surface && typeof node.surface === 'object' && typeof (node.surface as { entry?: unknown }).entry === 'string' ? (node.surface as { entry: string }).entry : undefined;
  const entry = typeof node.entry === 'string' ? node.entry : surfaceEntry;
  if (node.entry !== undefined && (typeof node.entry !== 'string' || node.entry.startsWith('/') || node.entry.includes('..'))) return { ok: false, errors: ['node.entry must be a relative path inside the node'] };
  if (surfaceEntry && (surfaceEntry.startsWith('/') || surfaceEntry.includes('..'))) return { ok: false, errors: ['surface.entry must be a relative path inside the node'] };
  if (entry) {
    const entryPath = resolve(appRoot, entry);
    if (!entryPath.startsWith(`${resolve(appRoot)}${sep}`)) return { ok: false, errors: ['node.entry must remain inside the app'] };
    if (!existsSync(entryPath)) return { ok: false, errors: [`node entry does not exist: ${entry}`] };
  }
  if (entry && !/\.(html?|js|mjs|css)$/.test(entry)) return { ok: false, errors: ['node entry must point to a browser-loadable html/js/css file'] };
  if (task.capability === 'app:identity') {
    const icon = join(appRoot, 'icon.svg');
    if (!existsSync(icon)) return { ok: false, errors: ['app identity requires a valid icon.svg'] };
    const svg = readFileSync(icon, 'utf8');
    if (!/<svg\b[^>]*viewBox=/i.test(svg) || !/<(?:path|rect|circle|polygon|g)\b/i.test(svg)) return { ok: false, errors: ['app identity icon.svg must be a drawable SVG with viewBox and visible geometry'] };
    if (/sparkles|lucide|placeholder|generic/i.test(svg)) return { ok: false, errors: ['app identity icon.svg appears generic; create a recognizable app-specific mark'] };
  }
  if (task.capability.startsWith('surface:')) {
    const [, appId, ...routeParts] = task.capability.split(':');
    const route = routeParts.join(':');
    const found = loadWorld(root).surfaces.some(surface => surface.appId === appId && surface.route === route);
    if (!found) return { ok: false, errors: [`generated surface route is missing: ${route}; expose it through node.json (for /, the app-root node must define surface or a valid local entry)`] };
  }
  return { ok: true };
}

function findAppRoot(world: string, target: string) {
  const apps = join(world, 'apps');
  if (target.startsWith(`${apps}/`)) {
    const suffix = target.slice(apps.length + 1).split('/')[0];
    const root = join(apps, suffix);
    try { if (statSync(root).isDirectory()) return root; } catch {}
  }
  return undefined;
}
