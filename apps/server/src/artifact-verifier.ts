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
    for (const source of localReferences(text)) {
      const clean = source.split(/[?#]/)[0]; if (!clean || clean.startsWith("#") || /^(data:|blob:|https?:|mailto:|javascript:)/i.test(clean)) continue;
      const target = resolve(dirname(file), clean);
      if (!target.startsWith(resolve(root)) || !known.has(target)) errors.push(file + ": missing local asset " + source);
    }
    if (/<script[^>]+src=["']https?:/i.test(text) || /<link[^>]+href=["']https?:/i.test(text)) warnings.push(file + ": external runtime dependency");
    if (effort !== "fast" && /<button(?:\s[^>]*)?>[^<]*<\/button>/i.test(text) && !/(addEventListener|onclick)/.test(text)) warnings.push(file + ": visible controls may lack behavior");
  }
  const report = { ok: errors.length === 0, errors, warnings, scenarios }; mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, "verification.json"), JSON.stringify(report, null, 2) + "\n"); return report;
}
function walk(root: string): string[] { const files: string[] = []; for (const entry of readdirSync(root, { withFileTypes: true })) { if (entry.name === "data") continue; const path = join(root, entry.name); if (entry.isDirectory()) files.push(...walk(path)); else if (entry.isFile()) files.push(path); } return files; }
function localReferences(text: string) { const values: string[] = []; const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi; for (const match of text.matchAll(pattern)) values.push(match[1] ?? match[2]); return values; }
