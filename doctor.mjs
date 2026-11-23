// Run with:  npm run doctor      Checks why http://localhost:4000 might not open, and whether your AI engine is ready.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { root, readEnv, pickProvider } from "./lib-env.mjs";
let bad = 0;
const ok = (m) => console.log("  OK   " + m);
const no = (m, fix) => { bad++; console.log("  FAIL " + m + "\n       -> " + fix); };

console.log("Checking your setup...\n");
const major = +process.versions.node.split(".")[0];
major >= 18 ? ok(`Node ${process.versions.node}`) : no(`Node ${process.versions.node} is too old`, "install Node 18 or newer from https://nodejs.org, then reopen VS Code");

const { exists, env } = readEnv(), provider = pickProvider(env);
const need = ["express", "multer", "dotenv", ...(provider === "anthropic" ? ["@anthropic-ai/sdk"] : [])];
const missing = need.filter((d) => !fs.existsSync(path.join(root, "server", "node_modules", d)));
missing.length ? no("packages not installed: " + missing.join(", "), "run:  npm run setup   (or skip installing and use:  npm run demo)") : ok("packages installed");

if (!exists) no("server/.env is missing", "copy server/.env.example to server/.env  (on Windows:  copy server\\.env.example server\\.env)");
else {
  console.log(`  INFO AI engine: ${provider}`);
  if (provider === "anthropic") /^sk-ant-[A-Za-z0-9_-]{30,}/.test(env.ANTHROPIC_API_KEY || "") ? ok("Anthropic API key looks valid") : no("ANTHROPIC_API_KEY is empty or still a placeholder", "paste your real key after ANTHROPIC_API_KEY= (no quotes), or use the free local AI: set LLM_PROVIDER=ollama");
  else if (provider === "openai") env.LLM_BASE_URL && env.LLM_API_KEY !== undefined && env.LLM_MODEL ? ok("OpenAI-compatible service is configured") : no("LLM_BASE_URL / LLM_API_KEY / LLM_MODEL are not all set", "fill the three LLM_ lines in server/.env");
  else if (provider === "ollama") {
    const url = String(env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""), model = env.OLLAMA_MODEL || "qwen3.5:4b";
    let tags = null; try { tags = await (await fetch(url + "/api/tags", { signal: AbortSignal.timeout(3000) })).json(); } catch { /* not running */ }
    if (!tags) no(`Ollama is not running at ${url}`, "install it from https://ollama.com, start the Ollama app, then run this again");
    else {
      ok(`Ollama is running at ${url}`);
      const names = (tags.models || []).map((m) => m.name);
      names.some((n) => n === model || n === model + ":latest") ? ok(`model ${model} is installed`) : no(`model ${model} is not installed`, `run:  ollama pull ${model}`);
      try { const l = ((await (await fetch(url + "/api/ps")).json()).models || [])[0]; if (l) console.log(`  INFO ${l.name} is loaded, ${l.size ? Math.round((100 * l.size_vram) / l.size) : 0}% on the GPU`); } catch { /* ignore */ }
    }
  } else no(`LLM_PROVIDER=${provider} is not valid`, "use ollama, anthropic or openai");
  const m = env.PORT; if (m && m !== "4000") console.log(`  NOTE server/.env sets PORT=${m}: open http://localhost:${m} instead`);
}
fs.existsSync(path.join(root, "frontend", "index.html")) ? ok("frontend/index.html found") : no("frontend/index.html missing", "unzip the project again; you may have opened the wrong folder (open the folder that contains frontend and server)");

const port = +(env.PORT || 4000);
await new Promise((res) => {
  const s = net.createServer().once("error", (e) => { e.code === "EADDRINUSE" ? no(`port ${port} is already used by another program`, `close it, or set PORT=${port + 1} in server/.env`) : no(`cannot use port ${port}: ` + e.code, `set PORT=${port + 1} in server/.env`); res(); })
    .once("listening", () => { s.close(); ok(`port ${port} is free`); res(); }).listen(port);
});

console.log(bad ? `\n${bad} problem(s) found. Fix them in order, then run:  npm start` : `\nAll good. Run:  npm start   then open http://localhost:${port}\nKeep that terminal open: closing it stops the site.`);
process.exit(bad ? 1 : 0);
