// Lets eval scripts use the key from server/.env on any system (no "KEY=value command" needed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "../server/.env");
if (fs.existsSync(p)) for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
