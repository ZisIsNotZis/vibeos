export type NodeId = string;
export type WorldNode = {
  id: NodeId;
  title: string;
  kind: string;
  status?: 'placeholder' | 'available' | 'failed';
  route?: string;
  icon?: string;
  parentId?: NodeId;
  children: Array<{ id: NodeId; title: string; kind: string; path: string }>;
  surface?: { heading: string; body: string; controls: Array<{ id: string; label: string; intent: unknown }> };
};
