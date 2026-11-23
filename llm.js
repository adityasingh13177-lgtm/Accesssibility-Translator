import { cfg } from "../config.js";
import { AppError } from "../errors.js";
import { buildSystem, qaSystem, mergePrompt, sentenceSystem, translateSystem, EXAMPLE_DOC, EXAMPLE_OUT } from "../prompts.js";
import { validateResult, groundResult, norm } from "./validate.js";
import { pickExamples } from "../examples.js";
import { RESULT_SCHEMA, QA_SCHEMA } from "./schemas.js";
import { ollamaCall, openAiCompatCall } from "./providers.js";

let client;
// Picks the back-end from cfg.provider ("ollama" | "openai" | "anthropic"). The Anthropic SDK is imported lazily
// so unit tests (and Ollama users) never need it. `json` / `schema` only matter to Ollama: they force valid JSON.
export async function defaultCall(args) {
  if (cfg.provider === "ollama") return ollamaCall(args);
  if (cfg.provider === "openai") return openAiCompatCall(args);
  const { system, messages, maxTokens = 2500 } = args;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const r = await client.messages.create({ model: cfg.model, max_tokens: maxTokens, system, messages });
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

export function chunkText(text, max = cfg.chunkChars) {
  const parts = text.split(/\n{2,}/), chunks = []; let cur = "";
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (let p of parts) {
    while (p.length > max) { push(); chunks.push(p.slice(0, max)); p = p.slice(max); }
    if ((cur + "\n\n" + p).length > max) push();
    cur += (cur ? "\n\n" : "") + p;
  }
  push();
  return chunks.length ? chunks : [text];
}

export function parseJson(s) {
  const t = String(s).replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object found");
  return JSON.parse(t.slice(a, b + 1));
}

// Wrap the document so it cannot break out of its tag (prompt-injection defence).
const wrap = (text, note = "") => `${note}<document>\n${text.replace(/<\/?document>/gi, "")}\n</document>`;

async function runJson({ system, messages, callModel, check = validateResult, schema = RESULT_SCHEMA }) {
  let raw = await callModel({ system, messages, json: true, schema }), lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = check(parseJson(raw));
      if (res.ok) return res.value;
      lastErr = res.errors.join("; ");
    } catch (e) { lastErr = e.message; }
    if (attempt === 0) raw = await callModel({ system, json: true, schema, messages: [...messages, { role: "assistant", content: String(raw) }, { role: "user", content: `Your reply was invalid (${lastErr}). Reply again with ONLY the corrected JSON object.` }] });
  }
  throw new AppError("MODEL_INVALID", "We couldn\u2019t prepare your results this time. Please try again.", 502);
}

// Worked examples: your approved ones (most similar first) or, if there are none, the built-in one.
const shots = (chunk, note, picked = []) => {
  const ex = picked.length ? picked : [{ text: EXAMPLE_DOC, output: EXAMPLE_OUT }];
  return [...ex.flatMap((e) => [{ role: "user", content: wrap(e.text, "(Example)\n") }, { role: "assistant", content: JSON.stringify(e.output) }]), { role: "user", content: wrap(chunk, note) }];
};

export async function simplify({ text, level, language, callModel = defaultCall, extraRules = "", useExamples = true, examples }) {
  const system = buildSystem(level, language) + (extraRules ? "\n" + extraRules : ""), chunks = chunkText(text);
  const picked = useExamples ? pickExamples(text, { language, ...(examples ? { examples } : {}) }) : [];
  let value;
  if (chunks.length === 1) value = await runJson({ system, messages: shots(chunks[0], "", picked), callModel });
  else {
    const partials = []; let ctx = "";
    for (const [i, c] of chunks.entries()) {
      const note = `Part ${i + 1} of ${chunks.length}.${ctx ? " Summary so far: " + ctx : ""}\n`;
      const p = await runJson({ system, messages: shots(c, note, picked), callModel });
      partials.push(p); ctx = p.explanation.join(" ").slice(0, 600);
    }
    value = await runJson({ system, messages: [{ role: "user", content: mergePrompt(partials) }], callModel });
  }
  return groundResult(value, text);
}

export const NOT_MENTIONED = "This is not mentioned in the document.";
const qaCheck = (o) => (o && typeof o.found === "boolean" ? { ok: true, errors: [], value: o } : { ok: false, errors: ["missing boolean found"], value: null });

export async function answerQuestion({ text, question, language, callModel = defaultCall }) {
  const messages = [{ role: "user", content: `${wrap(text)}\n<question>${question.replace(/<\/?question>/gi, "")}</question>` }];
  const o = await runJson({ system: qaSystem(language), messages, callModel, check: qaCheck, schema: QA_SCHEMA });
  const q = norm(o.quote || "");
  if (!o.found || !o.answer || q.length < 3 || !norm(text).includes(q)) return { found: false, answer: NOT_MENTIONED, quote: "" };
  return { found: true, answer: o.answer, quote: o.quote };
}

export async function simplifySentence({ text, level, callModel = defaultCall }) {
  const out = await callModel({ system: sentenceSystem(level), messages: [{ role: "user", content: `<sentence>${text.replace(/<\/?sentence>/gi, "")}</sentence>` }], maxTokens: 400 });
  return String(out).trim().replace(/^["\u201c]|["\u201d]$/g, "");
}

export async function translateText({ text, language, callModel = defaultCall }) {
  const out = await callModel({ system: translateSystem(language), messages: [{ role: "user", content: `<text>${text.replace(/<\/?text>/gi, "")}</text>` }], maxTokens: 1200 });
  return String(out).trim();
}
