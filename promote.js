import "./env.js";
// Teach the app from a document you have already labeled and verified.
// Usage: ANTHROPIC_API_KEY=... node eval/promote.js D002
// It runs the app on that row, only offers outputs that match your labels perfectly (no invented facts), and asks you to confirm.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseCsv, scoreCase, getText } from "./lib.js";
import { simplify } from "../server/src/services/llm.js";
import { EXAMPLES_FILE, acceptExample } from "../server/src/examples.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export function eligible(c) {
  return c.hallucinated === 0 && c.ungrounded === 0 && ["facts", "deadlines", "steps", "notFound"].every((k) => c[k][0] === c[k][1]);
}
export function makeExample(row, text, result) {
  const { warnings, ...output } = result;
  return acceptExample({ text, language: row.source_language || "English", output });
}
if (process.argv[1] && process.argv[1].endsWith("promote.js")) {
  const id = process.argv[2]; if (!id) { console.log("Usage: node eval/promote.js <doc_id from test_set.csv>"); process.exit(1); }
  const row = parseCsv(fs.readFileSync(path.join(here, "test_set.csv"), "utf8")).find((r) => r.doc_id === id);
  if (!row) { console.log("No such doc_id"); process.exit(1); }
  const g = await getText(row.original_text_or_file); if (g.skip) { console.log(g.skip); process.exit(1); }
  const r = await simplify({ text: g.text, level: "Simple", language: row.source_language || "English", useExamples: false });
  const c = scoreCase(row, r);
  if (!eligible(c)) { console.log("Not added: the output does not match your labels perfectly:\n - " + c.miss.join("\n - ")); process.exit(0); }
  console.log(JSON.stringify(r, null, 2));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const yes = /^y/i.test(await rl.question("\nThis matches your labels. Add it as a teaching example? (y/n) ")); rl.close();
  const ex = yes && makeExample(row, g.text, r);
  if (ex) { fs.appendFileSync(EXAMPLES_FILE, JSON.stringify(ex) + "\n"); console.log("Added to " + EXAMPLES_FILE); } else console.log("Nothing added.");
}
