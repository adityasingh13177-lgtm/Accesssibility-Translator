// Run with:  npm run ollama:check
// Runs your REAL pipeline once on the built-in example notice using your local model, and tells you
// whether it works, how fast it is, and whether it is using your GPU.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root, readEnv } from "./lib-env.mjs";
for (const [k, v] of Object.entries(readEnv().env)) process.env[k] ??= v;   // same settings the website uses
process.env.LLM_PROVIDER = "ollama";
const load = (f) => import(pathToFileURL(path.join(root, "server/src", f)).href);
const { cfg } = await load("config.js"), { ollamaStatus } = await load("services/providers.js");
const { simplify } = await load("services/llm.js"), { EXAMPLE_DOC } = await load("prompts.js");
const o = cfg.ollama, line = (s) => console.log(s), fail = (m, fix) => { line(`\nFAIL ${m}\n  -> ${fix}`); process.exit(1); };

line(`Checking local AI: ${o.model} at ${o.url} (context ${o.numCtx} tokens)\n`);
const st = await ollamaStatus();
if (!st.up) fail("Ollama is not running.", "Install it from https://ollama.com and start the Ollama app, then run this again.");
line("  OK   Ollama is running");
if (!st.hasModel) fail(`Model ${o.model} is not installed.`, `Run:  ollama pull ${o.model}   (installed models: ${st.names.join(", ") || "none"})`);
line(`  OK   model ${o.model} is installed`);

line("\nRunning the real pipeline on the example notice (the first run loads the model and can take a minute)...");
const t0 = Date.now(); let out;
try { out = await simplify({ text: EXAMPLE_DOC, level: "Simple", language: "English" }); }
catch (e) { fail(e.userMessage || e.message, "Check the lines above. If it says the reply was invalid, try again or use a larger model."); }
const secs = ((Date.now() - t0) / 1000).toFixed(1);

line(`\n  OK   got a valid, fact-checked answer in ${secs}s\n`);
line(`Title: ${out.title}`);
out.explanation.forEach((s) => line("  - " + s));
line("Key facts (each quoted from the notice):");
out.keyFacts.forEach((f) => line(`  - ${f.label}: ${f.value}   [quote: "${f.quote}"]`));
if (out.actionSteps.length) { line("Next steps:"); out.actionSteps.forEach((s) => line("  - " + s)); }
if (out.warnings.length) line("Dropped by the fact-checker: " + out.warnings.join("; "));

const l = (await ollamaStatus()).loaded;
if (l) {
  line(`\nGPU: ${o.model} is running ${l.gpuPct}% on the GPU (${(l.size / 1e9).toFixed(1)} GB in memory).`);
  if (l.gpuPct < 100) line(`WARNING: part of the model is on the CPU, so it is slow. Set OLLAMA_NUM_CTX=8192 in server/.env and restart Ollama.`);
}
line("\nAll good. Start the website with:  npm start");
