// Zero-dependency server: needs only Node 18+. No npm install, no API key.  Run:  npm run demo
// Serves the website and the same API contract as the full server, using the rule-based demo engine.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cfg } from "./config.js";
import { cleanText } from "./services/extract.js";
import { simplifyOffline, answerOffline } from "./services/offline.js";
import { AppError } from "./errors.js";
import { norm } from "./services/validate.js";

const here = path.dirname(fileURLToPath(import.meta.url)), WEB = path.join(here, "../../frontend");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function readBody(req, max = 12 * 1024 * 1024) {
  return new Promise((res, rej) => { const c = []; let n = 0;
    req.on("data", (d) => { n += d.length; if (n > max) { rej(new AppError("TOO_BIG", "That is too large.", 413)); req.destroy(); } else c.push(d); });
    req.on("end", () => res(Buffer.concat(c))); req.on("error", rej); });
}
// Minimal multipart reader: returns { fieldName: text } and notes which fields were files.
export function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || ""); if (!m) return {};
  const b = Buffer.from("--" + (m[1] || m[2])), fields = {}; let pos = buf.indexOf(b);
  while (pos >= 0) {
    const next = buf.indexOf(b, pos + b.length); if (next < 0) break;
    const part = buf.slice(pos + b.length + 2, next - 2), cut = part.indexOf("\r\n\r\n"); if (cut < 0) { pos = next; continue; }
    const head = part.slice(0, cut).toString("utf8"), name = /name="([^"]*)"/.exec(head)?.[1];
    if (name) fields[name] = /filename="/.test(head) ? { file: true } : part.slice(cut + 4).toString("utf8");
    pos = next;
  }
  return fields;
}
const send = (res, status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (req.method === "POST" && url.pathname === "/api/documents/process") {
        const f = parseMultipart(await readBody(req), req.headers["content-type"]);
        if (f.source !== "txt") throw new AppError("DEMO_ONLY", "Demo mode reads pasted text only. For PDFs, photos and web links, use the full server (see README).", 422);
        const level = cfg.levels.includes(f.level) ? f.level : "Simple";
        let text = cleanText(f.text); if (text.length < cfg.minChars) throw new AppError("EMPTY_TEXT", "Please paste a little more text so there is something to simplify.", 422);
        const warnings = []; if (text.length > cfg.maxDocChars) { text = text.slice(0, cfg.maxDocChars); warnings.push("TRUNCATED"); }
        const out = simplifyOffline({ text, level });
        return send(res, 200, { id: "g" + Date.now(), level, language: "English", ...out, warnings: [...warnings, ...out.warnings], original: text.slice(0, 4000) });
      }
      if (req.method === "POST" && /^\/api\/documents\/[^/]+\/ask$/.test(url.pathname)) {
        const b = JSON.parse((await readBody(req, 300000)).toString() || "{}"), q = String(b.question || "").trim().slice(0, 300);
        if (!q) throw new AppError("NO_QUESTION", "Please type a question.");
        if (!b.text) throw new AppError("NO_DOC", "We couldn\u2019t find that document.", 404);
        const r = answerOffline({ text: String(b.text), question: q });
        return send(res, 200, r.found && !norm(b.text).includes(norm(r.quote)) ? { found: false, answer: "This is not mentioned in the document.", quote: "" } : r);
      }
      if (req.method === "GET") {
        let p = path.normalize(path.join(WEB, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
        if (!p.startsWith(WEB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); return res.end(fs.readFileSync(p));
      }
      send(res, 404, { message: "Not found", code: "NOT_FOUND" });
    } catch (e) { send(res, e.status || 500, { message: e.userMessage || "Something went wrong. Please try again.", code: e.code || "SERVER_ERROR" }); }
  });
}
if (process.argv[1] && process.argv[1].endsWith("demo-server.js")) {
  const port = process.env.PORT || 4000;
  createServer().listen(port, () => console.log(`Demo mode (no AI key, no installs). Open http://localhost:${port}\nPaste text in the Text tab. Press Ctrl+C to stop.`));
}
