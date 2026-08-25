import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type { EffortLevel } from "@vibeos/shared";

export type VerificationReport = { ok: boolean; errors: string[]; warnings: string[]; scenarios: string[] };
const textExtensions = new Set([".html", ".htm", ".css", ".js", ".mjs"]);
export async function verifyArtifact(root: string, effort: EffortLevel, evidence: string): Promise<VerificationReport> {
  const errors: string[] = []; const warnings: string[] = []; const scenarios: string[] = [];
  const files = walk(root); const known = new Set(files.map(file => resolve(file)));
  for (const file of files) {
    if (!textExtensions.has(extname(file))) continue;
    const text = readFileSync(file, "utf8");
    // Static assets are declared in markup and CSS. JavaScript often contains
    // runtime URLs (Blob, object URLs, fetch targets), which are not files that
    // must exist in the artifact tree.
    for (const source of localReferences(text, extname(file))) {
      const clean = source.split(/[?#]/)[0]; if (!clean || clean.startsWith("#") || /^(data:|blob:|https?:|mailto:|javascript:)/i.test(clean)) continue;
      const target = resolve(dirname(file), clean);
      if (!target.startsWith(resolve(root)) || !known.has(target)) errors.push(file + ": missing local asset " + source);
    }
    if (/<script[^>]+src=["']https?:/i.test(text) || /<link[^>]+href=["']https?:/i.test(text)) warnings.push(file + ": external runtime dependency");
    if (effort !== "fast") {
      const behavior = text + linkedScriptText(text, file, known);
      for (const control of visibleButtons(text)) {
        if (!hasControlBehavior(control, behavior)) errors.push(file + ": dead visible control" + (control.id ? ` #${control.id}` : ""));
      }
    }
  }
  const report = { ok: errors.length === 0, errors, warnings, scenarios }; mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, "verification.json"), JSON.stringify(report, null, 2) + "\n"); return report;
}
function walk(root: string): string[] { const files: string[] = []; for (const entry of readdirSync(root, { withFileTypes: true })) { if (entry.name === "data") continue; const path = join(root, entry.name); if (entry.isDirectory()) files.push(...walk(path)); else if (entry.isFile()) files.push(path); } return files; }
function localReferences(text: string, extension: string) {
  if (extension === '.js' || extension === '.mjs') return [];
  const values: string[] = [];
  const pattern = extension === '.css'
    ? /url\(\s*["']?([^"')]+)["']?\s*\)/gi
    : /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  for (const match of text.matchAll(pattern)) values.push(match[1]);
  return values;
}

type VisibleButton = { id?: string; attributes: string };
function visibleButtons(text: string): VisibleButton[] {
  const buttons: VisibleButton[] = [];
  for (const match of text.matchAll(/<button\b([^>]*)>/gi)) {
    const attributes = match[1];
    if (/\bhidden\b|aria-hidden\s*=\s*["']true["']|display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes)) continue;
    const id = attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!/\bdisabled\b|aria-disabled\s*=\s*["']true["']/i.test(attributes)) buttons.push({ id, attributes });
  }
  return buttons;
}

function linkedScriptText(html: string, file: string, known: Set<string>): string {
  const source: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const target = resolve(dirname(file), match[1].split(/[?#]/)[0]);
    if (known.has(target)) {
      try { source.push(readFileSync(target, "utf8")); } catch {}
    }
  }
  return source.join("\n");
}

function hasControlBehavior(control: VisibleButton, source: string): boolean {
  if (/\bonclick\s*=\s*["'][^"']+/.test(control.attributes) || /\.onclick\s*=/.test(source)) return true;
  if (!/(addEventListener\s*\(|\.onclick\s*=)/i.test(source)) return false;
  if (!control.id) return true;
  const id = escapeRegExp(control.id);
  return new RegExp(`getElementById\\(\\s*["']${id}["']\\s*\\)|querySelector(?:All)?\\(\\s*["'][^"']*#${id}(?:["'])`, "i").test(source)
    || new RegExp(`(?:data-[\\w-]+|class)\\s*=\\s*["'][^"']*${id}[^"']*["']`, "i").test(source);
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
