// Benchmarks that use the real pipeline functions. Data files come from prepare.py (see DATASETS.md).
import { simplify, answerQuestion, translateText, NOT_MENTIONED } from "../../server/src/services/llm.js";
import { fkgl } from "../asset/metrics.js";

export const LANG = { hin_Deva: "Hindi", ben_Beng: "Bengali", mar_Deva: "Marathi", tam_Taml: "Tamil", tel_Telu: "Telugu", guj_Gujr: "Gujarati", kan_Knda: "Kannada", pan_Guru: "Punjabi", hi: "Hindi", bn: "Bengali", mr: "Marathi", ta: "Tamil", te: "Telugu", gu: "Gujarati", kn: "Kannada", pa: "Punjabi", as: "Assamese", ml: "Malayalam", or: "Odia", en: "English" };
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Q&A: answerable questions should be answered from the document; unanswerable ones must be refused.
export async function runQa(items, { callModel } = {}) {
  const t = { answerable: 0, hit: 0, falseRefusal: 0, unanswerable: 0, refused: 0, fabricated: 0 }, misses = [];
  for (const it of items) {
    const r = await answerQuestion({ text: it.context, question: it.question, language: LANG[it.lang] || "English", callModel });
    if (it.answerable) {
      t.answerable++;
      if (!r.found) { t.falseRefusal++; misses.push({ q: it.question, why: "refused an answerable question" }); continue; }
      const blob = norm(r.answer + " " + r.quote);
      if ((it.answers || []).some((a) => blob.includes(norm(a)))) t.hit++; else misses.push({ q: it.question, why: "answer differs from gold", got: r.answer });
    } else { t.unanswerable++; if (!r.found) t.refused++; else { t.fabricated++; misses.push({ q: it.question, why: "answered an unanswerable question", got: r.answer }); } }
  }
  return { ...t, answerRate: t.answerable ? t.hit / t.answerable : null, refusalRate: t.unanswerable ? t.refused / t.unanswerable : null, misses };
}

// Reading levels: do our three levels land near the real Elementary / Intermediate / Advanced bands of OneStopEnglish?
export async function runReadLevel(items, { callModel, levels = ["Very Simple", "Simple", "Standard"] } = {}) {
  const bands = [0, 1, 2].map((l) => mean(items.filter((i) => i.level === l).map((i) => fkgl(i.text))));
  const adv = items.filter((i) => i.level === 2), out = {};
  for (const level of levels) {
    const g = [];
    for (const it of adv) { const r = await simplify({ text: it.text, level, language: "English", callModel }); g.push(fkgl(r.explanation.join(" "))); }
    out[level] = mean(g);
  }
  return { bands: { elementary: bands[0], intermediate: bands[1], advanced: bands[2] }, ours: out, ordered: levels.every((l, i) => i === 0 || out[levels[i - 1]] <= out[l]) };
}

// Translation: writes hypotheses; chrF++ is computed by score.py.
export async function runTranslate(items, { callModel } = {}) {
  const rows = [];
  for (const it of items) rows.push({ ...it, hyp: await translateText({ text: it.src, language: LANG[it.tgt] || it.tgt, callModel }) });
  return rows;
}

// Summarisation: our "explanation" is compared with the reference summary by score.py (ROUGE).
export async function runSummarise(items, { callModel, level = "Simple" } = {}) {
  const rows = [];
  for (const it of items) { const r = await simplify({ text: it.text, level, language: LANG[it.lang] || "English", callModel }); rows.push({ ...it, hyp: r.explanation.join(" "), dropped: r.warnings.length }); }
  return rows;
}
export { NOT_MENTIONED };
