// Tiny helpers shared by doctor.mjs and ollama-check.mjs (no packages needed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Reads server/.env the same way dotenv does: KEY=value, "# comment" after a space is ignored.
export function readEnv() {
  const p = path.join(root, "server", ".env"), env = {};
  if (!fs.existsSync(p)) return { exists: false, env };
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line); if (!m || line.trim().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
  }
  return { exists: true, env };
}
// Same rule as server/src/config.js
export const pickProvider = (env) => String(env.LLM_PROVIDER || (/^sk-ant-[A-Za-z0-9_-]{30,}/.test(env.ANTHROPIC_API_KEY || "") ? "anthropic" : "ollama")).toLowerCase();
