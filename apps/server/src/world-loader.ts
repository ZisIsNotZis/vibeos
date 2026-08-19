import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AppRecord, Surface, WorldNode } from '@vibeos/shared';

export type WorldIndex = { apps: AppRecord[]; surfaces: Surface[]; nodes: WorldNode[] };

export function loadWorld(root: string): WorldIndex {
  const apps: AppRecord[] = []; const surfaces: Surface[] = []; const nodes: WorldNode[] = [];
  const appsRoot = join(root, 'apps');
  if (!statSafe(appsRoot)) return { apps, surfaces, nodes };
  for (const entry of readdirSync(appsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(appsRoot, entry.name, 'node.json'); const node = readNode(path); if (!node) continue;
    nodes.push(node); apps.push({ id: node.id, name: node.title, description: node.surface?.body ?? '', icon: node.icon ?? '', category: node.kind, installed: true, status: 'available' });
    if (node.surface) surfaces.push({ id: `${node.id}-root`, appId: node.id, route: '/', title: node.title, status: 'ready', content: { heading: node.surface.heading, body: node.surface.body, controls: [] } });
    loadChildren(join(appsRoot, entry.name, 'children'), node.id, nodes, surfaces);
  }
  return { apps, surfaces, nodes };
}

function loadChildren(root: string, parentId: string, nodes: WorldNode[], surfaces: Surface[]) {
  if (!statSafe(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const node = readNode(join(root, entry.name, 'node.json')); if (!node) continue;
    node.parentId ??= parentId; nodes.push(node);
    if (node.surface) surfaces.push({ id: `${node.id}-root`, appId: node.id, route: '/', title: node.title, status: 'ready', content: { heading: node.surface.heading, body: node.surface.body, controls: [] } });
    loadChildren(join(root, entry.name, 'children'), node.id, nodes, surfaces);
  }
}

function readNode(path: string): WorldNode | undefined { try { return JSON.parse(readFileSync(path, 'utf8')) as WorldNode; } catch { return undefined; } }
function statSafe(path: string) { try { return statSync(path).isDirectory(); } catch { return false; } }
