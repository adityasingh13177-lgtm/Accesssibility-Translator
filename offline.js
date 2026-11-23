// DEMO ENGINE: rule-based, runs with no AI key and no packages. Clearly simpler than the AI engine,
// but it reads the text you give it and uses the same fact-checking (every key fact is quoted from the document).
import { AppError } from "../errors.js";
import { validateResult, groundResult } from "./validate.js";

const DICT = [["remit", "pay"], ["remits", "pays"], ["remitted", "paid"], ["prescribed", "fixed"], ["shall", "must"], ["failing which", "if not"], ["on or before", "by"],
  ["hereinafter", "from now on"], ["aforementioned", "mentioned above"], ["commence", "start"], ["commences", "starts"], ["terminate", "end"], ["terminated", "ended"],
  ["pursuant to", "under"], ["notwithstanding", "even if"], ["forthwith", "at once"], ["endeavour", "try"], ["subsequently", "later"], ["thereof", "of it"], ["utilise", "use"],
  ["obtain", "get"], ["submit", "hand in"], ["non-transferable", "not able to be given to someone else"], ["stands rejected", "is cancelled"], ["applicants", "people applying"],
  ["applicant", "person applying"], ["outstanding amount", "unpaid amount"], ["surcharge", "extra charge"], ["liable", "responsible"], ["adhere to", "follow"], ["prior to", "before"],
  ["in lieu of", "instead of"], ["mandatory", "required"], ["eligible", "allowed to apply"], ["remittance", "payment"], ["tenure", "time period"]];
const MAP = new Map(DICT), KEYS = DICT.map((d) => d[0]).sort((a, b) => b.length - a.length);
const RE = new RegExp(`\\b(${KEYS.map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`, "gi");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plain = (s) => cap(s.replace(RE, (m) => { const r = MAP.get(m.toLowerCase()); return m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? cap(r) : r; }));

export function sentences(text) {
  const t = text.replace(/\s+/g, " ").trim().replace(/\b(Rs|No|Nos|Mr|Mrs|Ms|Dr|St|Sr|Jr|vs|etc|Inc|Ltd|approx)\./gi, "$1\u00a7");
  return t.split(/(?<=[.!?])\s+(?=[A-Z0-9"\u201c(])/).map((s) => s.replace(/\u00a7/g, ".").trim()).filter(Boolean);
}
// A short or ALL-CAPS line is a heading, unless it is an instruction such as "Keep the receipt."
const isHeading = (s) => !STEP.test(s) && (s.split(" ").length < 4 || (s === s.toUpperCase() && /[A-Z]/.test(s)));

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?\\s+\\d{4}\\b|\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b|\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b`, "gi");
const AMOUNT = /(?:Rs\.?\s?|INR\s?|\u20b9\s?|\$\s?|USD\s?|\u20ac\s?|\u00a3\s?)\d[\d,]*(?:\.\d+)?/g;
const PERCENT = /\b\d+(?:\.\d+)?\s?%/g;

function facts(text) {
  const out = [], seen = new Set();
  const add = (label, m) => {
    const value = m[0].trim(); if (seen.has(value.toLowerCase())) return; seen.add(value.toLowerCase());
    const before = text.slice(Math.max(0, m.index - 60), m.index), pre = (before.match(/(?:\S+\s+){0,3}$/) || [""])[0];
    out.push({ label: typeof label === "function" ? label(before.toLowerCase()) : label, value, quote: (pre + m[0]).trim() });
  };
  for (const m of text.matchAll(DATE)) add((b) => (/\b(before|by|until|till|deadline|due|last date)\b/.test(b) ? "Deadline" : "Date"), m);
  for (const m of text.matchAll(AMOUNT)) add((b) => {
    const near = b.slice(-32);                                        // look at the words just before the amount
    if (/late fee|late charge|penalty|fine\b|surcharge/.test(near)) return "Late fee";
    if (/amount due|total due|balance due|due amount|payable/.test(near)) return "Amount due";
    const w = near.match(/\b(fee|bill|tax|deposit|rent|stipend|scholarship|salary|premium)\b/); return w ? cap(w[1]) : "Amount";
  }, m);
  for (const m of text.matchAll(PERCENT)) add("Percentage", m);
  return out.slice(0, 8);
}
const STEP = /\b(must|shall|should|required|need to|needs to|have to|has to|advised|please|kindly|are to|is to)\b|\bmay\s+(pay|apply|visit|submit|contact|collect)\b|^(pay|submit|bring|attach|apply|visit|contact|keep|complete|fill|sign|send|carry|provide|upload|register|collect|download|check|ensure)\b/i;
const MISSING = [
  ["Refund rules", /refund|money back|reimburse/i], ["Helpline or contact details", /helpline|phone|call us|contact|e-?mail|toll.?free|@/i],
  ["Late fee or penalty", /late fee|penalty|fine\b|surcharge|interest/i], ["Eligibility rules", /eligib|qualif|criteria/i]];

export function simplifyOffline({ text, level = "Simple" }) {
  const all = sentences(text), body = all.filter((s) => !isHeading(s));
  if (!body.length) throw new AppError("EMPTY_TEXT", "We couldn\u2019t find enough readable text. Try pasting more of the document.", 422);
  const heading = all.find((s) => isHeading(s) && s.length > 6), first = (heading || body[0]).replace(/[.!?:]+$/, "");
  const title = heading ? cap(first.toLowerCase()) : first.split(" ").slice(0, 7).join(" ") + (first.split(" ").length > 7 ? "\u2026" : "");
  const n = level === "Very Simple" ? 2 : 3;
  const EASY = new Set(["shall", "applicant", "applicants", "submit", "obtain", "ensure", "prior to"]);
  const found = [...new Set((text.match(RE) || []).map((m) => m.toLowerCase()))].filter((t) => !EASY.has(t)).slice(0, 6);
  const notFound = MISSING.filter(([, re]) => !re.test(text)).map(([l]) => l);
  if (!facts(text).some((f) => f.label === "Deadline")) notFound.unshift("Deadline");
  const value = {
    title: title.slice(0, 80), explanation: body.slice(0, n).map(plain), keyFacts: facts(text),
    difficultTerms: found.map((t) => ({ term: t, meaning: MAP.get(t) })),
    actionSteps: [...new Set(body.filter((s) => s.length > 12 && STEP.test(s)).map(plain))].slice(0, 6), notFound: notFound.slice(0, 5),
  };
  const v = validateResult(value);
  return { ...groundResult(v.value, text), warnings: ["DEMO_ENGINE", ...groundResult(v.value, text).warnings] };
}

const STOP = new Set("the and for how what when where who why which does did are was were with this that have has you your from will can not any about much many".split(" "));
const tk = (s) => new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)));
export function answerOffline({ text, question }) {
  const q = tk(question); if (!q.size) return { found: false, answer: "This is not mentioned in the document.", quote: "" };
  let best = null;
  const wantDate = /\b(when|deadline|due date|last date|by when|until when)\b/i.test(question), wantAmount = /\b(how much|cost|price|fee|amount|charge)\b/i.test(question);
  const hasDate = new RegExp(DATE.source, "i"), hasAmount = new RegExp(AMOUNT.source);
  for (const s of sentences(text)) {
    const t = tk(s); let hit = 0; q.forEach((w) => t.has(w) && hit++);
    let sc = hit / q.size;
    if (wantDate && hasDate.test(s)) sc = Math.max(sc, 0.6);          // "when" questions want a sentence with a date
    if (wantAmount && hasAmount.test(s)) sc = Math.max(sc, 0.6);      // "how much" questions want a sentence with an amount
    if (!best || sc > best.sc) best = { s, sc };
  }
  if (!best || best.sc < 0.5) return { found: false, answer: "This is not mentioned in the document.", quote: "" };
  const quote = best.s.split(" ").slice(0, 25).join(" ");
  return { found: true, answer: plain(best.s), quote };
}
