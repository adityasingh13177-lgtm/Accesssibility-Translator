// Tests the Ollama back-end against a FAKE Ollama server: no GPU, no model, no internet needed.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.OLLAMA_QUIET = "1"; process.env.LLM_PROVIDER = "ollama";
const { cfg } = await import("../src/config.js");
const { ollamaCall, ollamaStatus } = await import("../src/services/providers.js");
const { defaultCall, simplify, answerQuestion, translateText } = await import("../src/services/llm.js");
const { EXAMPLE_DOC, EXAMPLE_OUT } = await import("../src/prompts.js");
const { RESULT_SCHEMA, QA_SCHEMA } = await import("../src/services/schemas.js");

let seen = [], behave = () => ({ status: 200, body: { message: { content: "ok" } } });
const srv = http.createServer((req, res) => {
  let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
    const body = b ? JSON.parse(b) : null; seen.push({ method: req.method, url: req.url, body });
    const r = req.method === "GET" ? ({
      "/api/tags": { status: 200, body: { models: [{ name: "qwen3.5:4b" }, { name: "llama3.2:3b" }] } },
      "/api/ps": { status: 200, body: { models: [{ name: "qwen3.5:4b", size: 5000, size_vram: 4000 }] } },
    })[req.url] || { status: 404, body: {} } : behave(body);
    res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.body));
  });
});
await new Promise((r) => srv.listen(0, r));
cfg.ollama.url = `http://127.0.0.1:${srv.address().port}`; cfg.ollama.model = "qwen3.5:4b"; cfg.ollama.numCtx = 16384;
test.after(() => srv.close());
const reset = () => { seen = []; };

test("defaults suit a 6 GB GPU", () => {
  assert.equal(cfg.provider, "ollama");
  assert.equal(cfg.chunkChars, 8000);   // smaller pieces for a small model
});

test("JSON calls: no thinking, exact schema, context size, temperature 0", async () => {
  reset(); behave = () => ({ status: 200, body: { message: { content: '{"a":1}' } } });
  const out = await ollamaCall({ system: "SYS", messages: [{ role: "user", content: "hi" }], json: true, schema: RESULT_SCHEMA });
  const b = seen[0].body;
  assert.equal(out, '{"a":1}'); assert.equal(seen[0].url, "/api/chat");
  assert.equal(b.model, "qwen3.5:4b"); assert.equal(b.stream, false); assert.equal(b.think, false);
  assert.deepEqual(b.format, RESULT_SCHEMA); assert.equal(b.options.num_ctx, 16384); assert.equal(b.options.temperature, 0);
  assert.deepEqual(b.messages[0], { role: "system", content: "SYS" }); assert.equal(b.messages[1].content, "hi");
  assert.ok(b.options.num_predict >= 3000);
});

test("plain-text calls do not force JSON", async () => {
  reset(); behave = () => ({ status: 200, body: { message: { content: "A simpler sentence." } } });
  const out = await ollamaCall({ system: "S", messages: [{ role: "user", content: "x" }], maxTokens: 400 });
  assert.equal(out, "A simpler sentence."); assert.equal("format" in seen[0].body, false); assert.equal(seen[0].body.options.num_predict, 400);
});

test("a model without a thinking mode is retried without the think flag", async () => {
  reset(); let n = 0;
  behave = (body) => (n++ === 0 ? { status: 400, body: { error: "\"qwen\" does not support thinking" } } : { status: 200, body: { message: { content: "fine" } } });
  assert.equal(await ollamaCall({ system: "S", messages: [] }), "fine");
  assert.equal(seen.length, 2); assert.equal(seen[0].body.think, false); assert.equal("think" in seen[1].body, false);
});

test("hidden <think> text is removed from the answer", async () => {
  behave = () => ({ status: 200, body: { message: { content: "<think>let me reason</think>\n{\"found\":false}" } } });
  assert.equal(await ollamaCall({ system: "S", messages: [] }), '{"found":false}');
});

test("model not installed gives a friendly error with the exact fix", async () => {
  behave = () => ({ status: 404, body: { error: "model 'qwen3.5:4b' not found" } });
  await assert.rejects(() => ollamaCall({ system: "S", messages: [] }), (e) => e.code === "MODEL_MISSING" && e.status === 503 && /ollama pull qwen3\.5:4b/.test(e.userMessage));
});

test("Ollama not running gives a friendly error", async () => {
  const keep = cfg.ollama.url; cfg.ollama.url = "http://127.0.0.1:1";
  await assert.rejects(() => ollamaCall({ system: "S", messages: [] }), (e) => e.code === "LLM_DOWN" && /not running/.test(e.userMessage));
  cfg.ollama.url = keep;
});

test("other server errors surface their message", async () => {
  behave = () => ({ status: 500, body: { error: "boom" } });
  await assert.rejects(() => ollamaCall({ system: "S", messages: [] }), /Ollama 500: boom/);
});

test("defaultCall routes to Ollama and passes json + schema through", async () => {
  reset(); behave = () => ({ status: 200, body: { message: { content: "{}" } } });
  await defaultCall({ system: "S", messages: [], json: true, schema: QA_SCHEMA });
  assert.deepEqual(seen[0].body.format, QA_SCHEMA);
});

test("status: installed models and GPU share", async () => {
  const s = await ollamaStatus();
  assert.equal(s.up, true); assert.equal(s.hasModel, true); assert.equal(s.loaded.gpuPct, 80);
  cfg.ollama.model = "not-installed:1b"; assert.equal((await ollamaStatus()).hasModel, false); cfg.ollama.model = "qwen3.5:4b";
});

test("end to end: simplify() with a local model gives a grounded result and forces the schema", async () => {
  reset(); behave = () => ({ status: 200, body: { message: { content: JSON.stringify(EXAMPLE_OUT) } } });
  const r = await simplify({ text: EXAMPLE_DOC, level: "Simple", language: "English" });
  assert.ok(r.keyFacts.length > 0); assert.equal(r.warnings.length, 0);
  assert.deepEqual(seen[0].body.format, RESULT_SCHEMA);
});

test("end to end: an invented fact from a weak model is dropped by the fact-checker", async () => {
  const bad = { ...EXAMPLE_OUT, keyFacts: [...EXAMPLE_OUT.keyFacts, { label: "Fee", value: "Rs. 9,999", quote: "a fee of Rs. 9,999 applies" }] };
  behave = () => ({ status: 200, body: { message: { content: JSON.stringify(bad) } } });
  const r = await simplify({ text: EXAMPLE_DOC, level: "Simple", language: "English" });
  assert.equal(r.keyFacts.some((f) => f.value.includes("9,999")), false); assert.ok(r.warnings.some((w) => /Fee/.test(w)));
});

test("end to end: a bad first reply is retried once, then succeeds", async () => {
  reset(); let n = 0;
  behave = () => ({ status: 200, body: { message: { content: n++ === 0 ? '{"title":"x"}' : JSON.stringify(EXAMPLE_OUT) } } });
  const r = await simplify({ text: EXAMPLE_DOC, level: "Simple", language: "English" });
  assert.equal(seen.length, 2); assert.ok(r.explanation.length > 0);
});

test("Q&A uses the Q&A schema and refuses when the quote is not in the document", async () => {
  reset(); behave = () => ({ status: 200, body: { message: { content: '{"found":true,"answer":"Rs. 5","quote":"fee is Rs. 5 per day"}' } } });
  const r = await answerQuestion({ text: EXAMPLE_DOC, question: "What is the fee?" });
  assert.equal(r.found, false); assert.deepEqual(seen[0].body.format, QA_SCHEMA);
});

test("translateText stays plain text", async () => {
  reset(); behave = () => ({ status: 200, body: { message: { content: "  hola  " } } });
  assert.equal(await translateText({ text: "hello", language: "Spanish" }), "hola"); assert.equal("format" in seen[0].body, false);
});
