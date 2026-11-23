// Model back-ends other than Anthropic.
//   LLM_PROVIDER=ollama  -> a model running on YOUR computer (free, private). Uses Ollama's native API.
//   LLM_PROVIDER=openai  -> any OpenAI-compatible service (Google Gemini free tier, Groq, OpenRouter...).
import { cfg } from "../config.js";
import { AppError } from "../errors.js";

const quiet = () => process.env.OLLAMA_QUIET === "1";
const stripThink = (s) => String(s ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

async function post(path, body) {
  const o = cfg.ollama;
  try {
    const r = await fetch(o.url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(o.timeoutMs) });
    const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, json, errText: String(json.error || text).slice(0, 300) };
  } catch (e) {
    if (e?.name === "TimeoutError") throw new AppError("LLM_TIMEOUT", "The local AI took too long. Try a shorter document.", 504);
    throw new AppError("LLM_DOWN", "The local AI (Ollama) is not running. Start Ollama, then try again.", 503);
  }
}

// One chat call to Ollama. `json: true` forces valid JSON (and the exact shape when `schema` is given).
export async function ollamaCall({ system, messages, maxTokens = 2500, json = false, schema }) {
  const o = cfg.ollama;
  const body = {
    model: o.model, stream: false, think: false, keep_alive: o.keepAlive,
    messages: [{ role: "system", content: system }, ...messages],
    // temperature 0 = steady answers; num_ctx = how much text the model can see at once.
    options: { num_ctx: o.numCtx, temperature: 0, num_predict: json ? Math.max(maxTokens, 3000) : maxTokens },
  };
  if (json) body.format = schema || "json";
  let r = await post("/api/chat", body);
  if (r.status === 400 && /think/i.test(r.errText)) { delete body.think; r = await post("/api/chat", body); } // model without a "thinking" mode
  if (r.status === 404) throw new AppError("MODEL_MISSING", `The AI model "${o.model}" is not installed. In a terminal run:  ollama pull ${o.model}`, 503);
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${r.errText}`);
  const j = r.json, content = stripThink(j.message?.content);
  if (!quiet()) {
    const s = (j.eval_duration || 0) / 1e9, n = j.eval_count || 0;
    console.log(`[ollama] ${o.model}: ${n} tokens in ${((j.total_duration || 0) / 1e9).toFixed(1)}s${s ? ` (${(n / s).toFixed(0)} tok/s)` : ""}${j.done_reason === "length" ? "  WARNING: reply was cut off (raise OLLAMA_NUM_CTX or shorten the document)" : ""}`);
  }
  return content;
}

// What is Ollama doing right now? Used by `npm run doctor`, `npm run ollama:check` and server start-up.
export async function ollamaStatus() {
  const o = cfg.ollama, get = async (p) => (await fetch(o.url + p, { signal: AbortSignal.timeout(3000) })).json();
  let tags; try { tags = await get("/api/tags"); } catch { return { up: false }; }
  const names = (tags.models || []).map((m) => m.name), want = o.model;
  const hasModel = names.some((n) => n === want || n === want + ":latest" || (!want.includes(":") && n.startsWith(want + ":")));
  let loaded = null;
  try {
    const m = ((await get("/api/ps")).models || []).find((x) => x.name === want || x.model === want || x.name === want + ":latest");
    if (m) loaded = { name: m.name, size: m.size, sizeVram: m.size_vram, gpuPct: m.size ? Math.round((100 * m.size_vram) / m.size) : 0 };
  } catch { /* older Ollama */ }
  return { up: true, names, hasModel, loaded };
}

// Load the model into memory once at start-up so the first real request is not slow.
export async function warmUp(log = console) {
  const o = cfg.ollama, st = await ollamaStatus();
  if (!st.up) return log.warn(`WARNING: Ollama is not running at ${o.url}. Start the Ollama app, then reload the page.`);
  if (!st.hasModel) return log.warn(`WARNING: model "${o.model}" is not installed. Run:  ollama pull ${o.model}`);
  log.log(`Loading ${o.model} into memory (the first time takes a little while)...`);
  const r = await post("/api/chat", { model: o.model, messages: [], stream: false, keep_alive: o.keepAlive, options: { num_ctx: o.numCtx } });
  if (!r.ok) return log.warn(`Could not load ${o.model}: ${r.errText}`);
  const l = (await ollamaStatus()).loaded;
  log.log(l ? `Ready: ${o.model} is running ${l.gpuPct}% on the GPU.` + (l.gpuPct < 100 ? " Part of it is on the CPU, so it will be slower: lower OLLAMA_NUM_CTX (for example 8192) in server/.env." : "") : `Ready: ${o.model}.`);
}

// Generic OpenAI-compatible chat endpoint (Gemini, Groq, OpenRouter...). Needs LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
export async function openAiCompatCall({ system, messages, maxTokens = 2500 }) {
  const base = String(process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("LLM_BASE_URL is empty: set it in server/.env");
  const key = process.env.LLM_API_KEY || "", model = process.env.LLM_MODEL || cfg.model;
  const r = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
    body: JSON.stringify({ model, max_tokens: Math.max(maxTokens, 8192), temperature: 0, messages: [{ role: "system", content: system }, ...messages] }),
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json().catch(() => ({})), err = Array.isArray(j) ? j[0]?.error : j.error;
  if (!r.ok) throw new Error(`LLM ${r.status}: ${err?.message || JSON.stringify(j).slice(0, 300)}`);
  const c = j.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x.text || "").join("") : "";
}
