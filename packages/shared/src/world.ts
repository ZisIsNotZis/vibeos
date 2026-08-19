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
  entry?: string;
  storage?: string;
  payload?: unknown;
  surface?: { heading: string; body: string; controls: Array<{ id: string; label: string; intent: unknown }>; fields?: Array<{ id: string; label: string; placeholder?: string; value?: string }>; board?: { columns: number; rows: number; activePiece?: string; nextPiece?: string; score?: number; lines?: number; level?: number; state?: string } };
};
