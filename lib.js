import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simplify } from "../server/src/services/llm.js";
import { extractFile, cleanText } from "../server/src/services/extract.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// Small CSV reader (quotes, commas and line breaks inside quotes).
export function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || "").trim()])));
}

export const split = (s) => String(s || "").split(";").map((x) => x.trim()).filter(Boolean);
const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/;
const toks = (s) => new Set((String(s).toLowerCase().match(/\p{L}{3,}|\p{N}+/gu) || []).map((t) => (MONTH.test(t) ? t.slice(0, 3) : t)));
export const overlap = (need, hay) => { const n = toks(need); if (!n.size) return 1; const h = toks(hay); let c = 0; n.forEach((t) => h.has(t) && c++); return c / n.size; };

// Scores a result written in the SOURCE language against the true answers in the CSV row.
export function scoreCase(row, r) {
  const factHay = [...r.keyFacts.map((k) => k.value + " " + k.quote), ...r.explanation].join(" ");
  const facts = split(row.true_key_facts), dls = split(row.true_deadlines), steps = split(row.true_steps), nots = split(row.not_in_document);
  const miss = [];
  const count = (arr, ok, label) => arr.filter((x) => { const y = ok(x); if (!y) miss.push(`${label}: ${x}`); return y; }).length;
  const s = {
    facts: [count(facts, (x) => overlap(x, factHay) >= 0.6, "missing fact"), facts.length],
    deadlines: [count(dls, (x) => overlap(x, factHay + " " + r.actionSteps.join(" ")) >= 0.9, "missing deadline"), dls.length],
    steps: [count(steps, (x) => r.actionSteps.some((a) => overlap(x, a) >= 0.5), "missing step"), steps.length],
    notFound: [count(nots, (x) => r.notFound.some((a) => overlap(x, a) >= 0.5), "should be flagged not found"), nots.length],
  };
  // Hallucination: something the document does NOT contain showing up as a key fact.
  const bad = nots.filter((x) => r.keyFacts.some((k) => overlap(x, k.label + " " + k.value) >= 0.8));
  bad.forEach((x) => miss.push(`HALLUCINATED as fact: ${x}`));
  return { ...s, hallucinated: bad.length, ungrounded: r.warnings.length, miss };
}

// Target-language run: must be valid, grounded, and keep every number/date digit from the true deadlines.
export function scoreTranslation(row, rt) {
  const blob = JSON.stringify(rt).replace(/,/g, "");
  const digits = split(row.true_deadlines).flatMap((d) => d.match(/\d+/g) || []);
  const kept = digits.filter((d) => blob.includes(d)).length;
  return { digitsKept: [kept, digits.length], ungrounded: rt.warnings.length };
}

export async function getText(v) {
  if (!/\.(txt|pdf|png|jpe?g|webp)$/i.test(v)) return { text: v };       // inline text
  const p = path.join(here, "files", v);
  if (!fs.existsSync(p)) return { skip: `file not found: put "${v}" in eval/files/` };
  if (/\.txt$/i.test(v)) return { text: fs.readFileSync(p, "utf8") };
  const kind = /\.pdf$/i.test(v) ? "pdf" : "img";
  const ex = await extractFile({ buffer: fs.readFileSync(p), originalname: v, mimetype: kind === "pdf" ? "application/pdf" : "image/png" }, kind);
  return { text: cleanText(ex.text) };
}

export async function runRow(row, { level = "Simple", callModel, simplifyOpts = {}, translate = true } = {}) {
  const g = await getText(row.original_text_or_file);
  if (g.skip) return { skip: g.skip };
  const src = row.source_language || "English", tgt = row.target_language || src;
  const r = await simplify({ text: g.text, level, language: src, callModel, ...simplifyOpts });
  const out = { content: scoreCase(row, r) };
  if (translate && tgt.toLowerCase() !== src.toLowerCase()) out.translation = scoreTranslation(row, await simplify({ text: g.text, level, language: tgt, callModel, ...simplifyOpts }));
  return out;
}
