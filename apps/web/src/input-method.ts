export type ImeCandidate = { text: string; segments: Array<{ key: string; word: string }> };
export type ImeState = { enabled: boolean; loading: boolean; preedit: string; candidates: ImeCandidate[]; selected: number; anchor?: { x: number; y: number } };
export type ImeTarget = { kind: 'local' | 'frame'; frame?: Window; channel?: string; element?: HTMLElement; anchor?: { x: number; y: number } };

const blank: ImeState = { enabled: false, loading: false, preedit: '', candidates: [], selected: 0 };
export class InputMethodController {
  private worker = new Worker('/ime/ime-worker.js'); private sequence = 0; private target?: ImeTarget; private state = blank;
  constructor(private readonly publish: (state: ImeState) => void) { this.worker.onmessage = event => this.receive(event.data); }
  destroy() { this.worker.terminate(); }
  snapshot() { return this.state; }
  toggle() { this.state = { ...blank, enabled: !this.state.enabled }; this.publish(this.state); }
  setTarget(target?: ImeTarget) { this.target = target; }
  accepts(element: EventTarget | null) { return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && !['button', 'checkbox', 'file', 'radio', 'range', 'submit'].includes(element.type) || element instanceof HTMLElement && element.isContentEditable; }
  key(key: string, anchor?: { x: number; y: number }) {
    if (!this.state.enabled) return false;
    if (/^[a-z]$/i.test(key)) { this.query(this.state.preedit + key.toLowerCase(), anchor); return true; }
    if (key === 'Backspace' && this.state.preedit) { this.query(this.state.preedit.slice(0, -1), anchor); return true; }
    if (key === 'Escape' && this.state.preedit) { this.clear(); return true; }
    if (key === ' ' && this.state.candidates.length) { this.choose(this.state.selected); return true; }
    if (key === 'Enter' && this.state.preedit) { this.commitLiteral(); return true; }
    if (/^[1-9]$/.test(key) && this.state.candidates[Number(key) - 1]) { this.choose(Number(key) - 1); return true; }
    if (key === 'ArrowDown' && this.state.candidates.length) { this.update({ ...this.state, selected: (this.state.selected + 1) % this.state.candidates.length }); return true; }
    if (key === 'ArrowUp' && this.state.candidates.length) { this.update({ ...this.state, selected: (this.state.selected + this.state.candidates.length - 1) % this.state.candidates.length }); return true; }
    return false;
  }
  private query(input: string, anchor?: { x: number; y: number }) { const id = ++this.sequence; this.update({ ...this.state, preedit: input, loading: true, anchor: anchor ?? this.target?.anchor }); this.worker.postMessage({ id, input }); }
  private receive(message: { id: number; ok: boolean; result?: { candidates: ImeCandidate[] }; error?: string }) { if (message.id !== this.sequence) return; if (!message.ok) { this.update({ ...this.state, loading: false }); return; } this.update({ ...this.state, loading: false, candidates: message.result?.candidates ?? [], selected: 0 }); }
  private choose(index: number) { const candidate = this.state.candidates[index]; if (!candidate) return; this.insert(candidate.text); const id = ++this.sequence; this.worker.postMessage({ id, input: '', commit: candidate.segments }); this.update({ ...blank, enabled: true }); }
  private commitLiteral() { this.insert(this.state.preedit); this.clear(); }
  private insert(text: string) { if (this.target?.kind === 'frame') { this.target.frame?.postMessage({ type: 'vibeos:ime-commit', channel: this.target.channel, text }, '*'); return; } const element = this.target?.element; if (!element) return; if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) { const start = element.selectionStart ?? element.value.length; const end = element.selectionEnd ?? start; element.setRangeText(text, start, end, 'end'); element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); return; } document.execCommand('insertText', false, text); element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); }
  private clear() { this.update({ ...blank, enabled: this.state.enabled }); }
  private update(state: ImeState) { this.state = state; this.publish(state); }
}
