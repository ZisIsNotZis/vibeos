import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AppRecord, Intent, Surface, WorldNode } from '@vibeos/shared';

export type WorldIndex = { apps: AppRecord[]; surfaces: Surface[]; nodes: WorldNode[] };

export function loadWorld(root: string): WorldIndex {
  const apps: AppRecord[] = []; const surfaces: Surface[] = []; const nodes: WorldNode[] = [];
  const appsRoot = join(root, 'apps');
  if (!statSafe(appsRoot)) return { apps, surfaces, nodes };
  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(appsRoot, entry.name, 'node.json'); const node = readNode(path); if (!node) continue;
    nodes.push(node); apps.push({ id: node.id, name: node.title, description: node.surface?.body ?? '', icon: node.icon ?? '', category: node.kind, installed: true, status: node.status ?? 'available' });
    const appRoot = join(appsRoot, entry.name);
    if (node.surface || node.entry) surfaces.push(toSurface(node.id, node.id, '/', node.title, node.surface ?? { heading: node.title, body: '', controls: [] }, node, appRoot, appRoot));
    loadChildren(join(appRoot, 'children'), node.id, node.id, '/', appRoot, nodes, surfaces);
  }
  return { apps, surfaces, nodes };
}

function loadChildren(root: string, parentId: string, appId: string, parentRoute: string, appRoot: string, nodes: WorldNode[], surfaces: Surface[]) {
  if (!statSafe(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const node = readNode(join(root, entry.name, 'node.json')); if (!node) continue;
    node.parentId ??= parentId; nodes.push(node); const route = node.route ?? `${parentRoute}/${entry.name}`.replace(/\/+/g, '/');
    const nodeRoot = join(root, entry.name);
    if (node.surface || node.entry) surfaces.push(toSurface(node.id, appId, route, node.title, node.surface ?? { heading: node.title, body: '', controls: [] }, node, nodeRoot, appRoot));
    loadChildren(join(nodeRoot, 'children'), node.id, appId, route, appRoot, nodes, surfaces);
  }
}

function readNode(path: string): WorldNode | undefined { try { return JSON.parse(readFileSync(path, 'utf8')) as WorldNode; } catch { return undefined; } }
function toSurface(nodeId: string, appId: string, route: string, title: string, surface: NonNullable<WorldNode['surface']>, node?: WorldNode, nodeRoot?: string, appRoot?: string): Surface {
  const id = `${nodeId}-surface`;
  const entry = node?.entry && nodeRoot && appRoot ? relative(appRoot, join(nodeRoot, node.entry)) : node?.entry;
  return { id, appId, route, title, status: 'ready', entry, content: { heading: surface.heading, body: surface.body, fields: surface.fields, board: surface.board, payload: node?.payload, entry, controls: surface.controls.map(control => ({ id: control.id, kind: 'button', label: control.label, action: toIntent(control.intent, appId, id, control.id) })) } };
}
function toIntent(intent: unknown, appId: string, surfaceId: string, controlId: string): Intent { const candidate = intent as { type?: string; appId?: string; surfaceId?: string }; if (candidate?.type === 'control' || (candidate?.type === 'activate_control' && candidate.appId === appId && candidate.surfaceId === surfaceId)) return { type: 'run_action', appId, surfaceId, action: controlId }; if (candidate?.type === 'navigate_browser' && !candidate.appId) return { ...(intent as Intent), appId } as Intent; return intent as Intent; }
function statSafe(path: string) { try { return statSync(path).isDirectory(); } catch { return false; } }
