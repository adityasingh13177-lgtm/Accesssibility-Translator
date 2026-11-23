// Validates the model's JSON and checks every key fact against the source text.
const MAX = { explanation: 3, keyFacts: 8, difficultTerms: 6, actionSteps: 7, notFound: 5 };
const isStr = (x) => typeof x === "string" && x.trim().length > 0;

export const norm = (s) => String(s).toLowerCase().replace(/[\u200b-\u200d\ufeff]/g, "")
  .replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();

export function validateResult(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, errors: ["reply is not a JSON object"], value: null };
  const errors = [];
  const list = (k, f) => { if (!Array.isArray(o[k])) { errors.push(`"${k}" must be an array`); return []; } return o[k].filter(f).slice(0, MAX[k]); };
  const value = {
    title: isStr(o.title) ? o.title.trim().slice(0, 100) : "Your document",
    explanation: list("explanation", isStr).map((s) => s.trim()),
    keyFacts: list("keyFacts", (x) => x && isStr(x.label) && isStr(x.value) && isStr(x.quote))
      .map((x) => ({ label: x.label.trim(), value: x.value.trim(), quote: x.quote.trim() })),
    difficultTerms: list("difficultTerms", (x) => x && isStr(x.term) && isStr(x.meaning))
      .map((x) => ({ term: x.term.trim(), meaning: x.meaning.trim() })),
    actionSteps: list("actionSteps", isStr).map((s) => s.trim()),
    notFound: list("notFound", isStr).map((s) => s.trim()),
  };
  if (!value.explanation.length) errors.push('"explanation" is empty');
  return { ok: errors.length === 0, errors, value };
}

// Anti-hallucination: a fact survives only if its quote really appears in the source
// and every number in its value appears in that quote.
export function groundResult(v, source) {
  const s = norm(source), warnings = [];
  const keyFacts = v.keyFacts.filter((f) => {
    const q = norm(f.quote);
    const nums = (f.value.match(/[0-9][0-9,.]*/g) || []).map((d) => d.replace(/[.,]+$/, "").replace(/,/g, ""));
    const ok = q.length > 2 && s.includes(q) && nums.every((d) => q.replace(/,/g, "").includes(d));
    if (!ok) warnings.push(`Dropped ungrounded fact: ${f.label}`);
    return ok;
  });
  return { ...v, keyFacts, warnings };
}
