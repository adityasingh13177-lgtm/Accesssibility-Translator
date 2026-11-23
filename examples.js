// "Learning from approved examples": documents YOU verified become few-shot examples shown to the model.
// Only examples that pass the same checks as live answers are loaded, and only ones in the target language are used.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateResult, groundResult } from "./services/validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLES_FILE = process.env.EXAMPLES_FILE || path.join(here, "../examples/approved.jsonl");
const toks = (s) => new Set(String(s).toLowerCase().match(/\p{L}{3,}|\p{N}+/gu) || []);

export function similarity(a, b) {
  const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((t) => B.has(t) && n++);
  return n / (A.size + B.size - n);          // Jaccard overlap of words
}

// Quality gate: valid JSON shape, and every key fact really appears in the example's own text.
export function acceptExample(e) {
  if (!e || typeof e.text !== "string" || e.text.trim().length < 40) return null;
  const v = validateResult(e.output); if (!v.ok) return null;
  const g = groundResult(v.value, e.text);
  if (g.warnings.length) return null;
  const { warnings, ...output } = g;
  return { text: e.text, language: e.language || "English", output };
}

let cache = { file: null, mtime: 0, rows: [] };
export function loadExamples(file = EXAMPLES_FILE) {
  if (!fs.existsSync(file)) return [];
  const m = fs.statSync(file).mtimeMs;
  if (cache.file === file && cache.mtime === m) return cache.rows;
  const rows = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return acceptExample(JSON.parse(l)); } catch { return null; } }).filter(Boolean);
  cache = { file, mtime: m, rows }; return rows;
}

export function pickExamples(text, { language = "English", k = 2, min = 0.12, examples = loadExamples() } = {}) {
  const probe = String(text).slice(0, 3000);
  return examples.filter((e) => e.language.toLowerCase() === String(language).toLowerCase())
    .map((e) => ({ e, s: similarity(probe, e.text) })).filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.e);
}
