export type ShortcutId = 'command-palette' | 'launcher' | 'ime-toggle' | 'screenshot' | 'close-window' | 'minimize-window' | 'maximize-window' | 'escape';
export type Shortcut = { id: ShortcutId; keys: string; description: string };
export const shortcuts: Shortcut[] = [
  { id: 'command-palette', keys: 'Ctrl/Cmd+K', description: 'Open the command palette' },
  { id: 'launcher', keys: 'Ctrl/Cmd+Shift+Space', description: 'Open app launcher' },
  { id: 'ime-toggle', keys: 'Ctrl/Cmd+Space', description: 'Toggle Chinese input' },
  { id: 'screenshot', keys: 'Ctrl/Cmd+Shift+S', description: 'Capture the desktop' },
  { id: 'close-window', keys: 'Ctrl/Cmd+W', description: 'Close focused window' },
  { id: 'minimize-window', keys: 'Ctrl/Cmd+M', description: 'Minimize focused window' },
  { id: 'maximize-window', keys: 'Ctrl/Cmd+Shift+M', description: 'Maximize or restore focused window' },
  { id: 'escape', keys: 'Escape', description: 'Close the active overlay' }
];
export function matchesShortcut(event: KeyboardEvent, id: ShortcutId) { const modifier = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase(); if (id === 'command-palette') return modifier && !event.shiftKey && key === 'k'; if (id === 'launcher') return modifier && event.shiftKey && event.code === 'Space'; if (id === 'ime-toggle') return modifier && !event.shiftKey && event.code === 'Space'; if (id === 'screenshot') return modifier && event.shiftKey && key === 's'; if (id === 'close-window') return modifier && !event.shiftKey && key === 'w'; if (id === 'minimize-window') return modifier && !event.shiftKey && key === 'm'; if (id === 'maximize-window') return modifier && event.shiftKey && key === 'm'; return id === 'escape' && event.key === 'Escape'; }
