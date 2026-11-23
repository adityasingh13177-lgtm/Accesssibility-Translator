import "./env.js";
// Usage: ANTHROPIC_API_KEY=... node eval/run_eval.js [eval/test_set.csv] [level]
// Files named in the CSV go in eval/files/ (PDF/image files also need the extractor running).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, runRow } from "./lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const csv = process.argv[2] || path.join(here, "test_set.csv"), level = process.argv[3] || "Simple";
const rows = parseCsv(fs.readFileSync(csv, "utf8"));
const T = { facts: [0, 0], deadlines: [0, 0], steps: [0, 0], notFound: [0, 0], digits: [0, 0], hall: 0, ungrounded: 0, ran: 0, failed: 0 };
const report = [];
for (const row of rows) {
  try {
    const o = await runRow(row, { level });
    if (o.skip) { console.log(`${row.doc_id}: SKIPPED (${o.skip})`); continue; }
    T.ran++;
    for (const k of ["facts", "deadlines", "steps", "notFound"]) { T[k][0] += o.content[k][0]; T[k][1] += o.content[k][1]; }
    T.hall += o.content.hallucinated; T.ungrounded += o.content.ungrounded + (o.translation?.ungrounded || 0);
    if (o.translation) { T.digits[0] += o.translation.digitsKept[0]; T.digits[1] += o.translation.digitsKept[1]; }
    console.log(`${row.doc_id} (${row.doc_type}): ${o.content.miss.length ? o.content.miss.join(" | ") : "all expected items found"}`);
    report.push({ id: row.doc_id, ...o });
  } catch (e) { T.failed++; console.log(`${row.doc_id}: FAILED (${e.code || e.message})`); report.push({ id: row.doc_id, error: e.code || e.message }); }
}
const p = ([a, b]) => (b ? Math.round((a / b) * 100) + "%" : "n/a");
console.log(`\nDocuments run: ${T.ran} (failed ${T.failed})\nKey facts found: ${p(T.facts)} | Deadlines: ${p(T.deadlines)} | Steps: ${p(T.steps)} | Missing info flagged: ${p(T.notFound)}\nNumbers kept after translation: ${p(T.digits)} | Hallucinated facts: ${T.hall} | Ungrounded facts dropped: ${T.ungrounded}`);
fs.writeFileSync(path.join(here, "report.json"), JSON.stringify(report, null, 2));
console.log("Details saved to eval/report.json. Paste this output to the assistant to tune the prompt.");
