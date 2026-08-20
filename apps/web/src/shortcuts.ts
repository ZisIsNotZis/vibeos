export type Shortcut = { id: string; keys: string; description: string };
export const shortcuts: Shortcut[] = [
  { id: 'launcher', keys: 'Ctrl/Cmd+K', description: 'Open app launcher' },
  { id: 'screenshot', keys: 'Ctrl/Cmd+Shift+S', description: 'Capture the desktop' },
  { id: 'escape', keys: 'Escape', description: 'Close the active overlay' }
];
export function isTextEntry(target: EventTarget | null) { const el = target as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); }
export function matchesShortcut(event: KeyboardEvent, id: string) { const modifier = event.metaKey || event.ctrlKey; return id === 'launcher' ? modifier && event.key.toLowerCase() === 'k' : id === 'screenshot' ? modifier && event.shiftKey && event.key.toLowerCase() === 's' : id === 'escape' && event.key === 'Escape'; }
