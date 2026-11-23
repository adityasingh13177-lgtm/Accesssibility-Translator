import "../env.js";
// Usage: ANTHROPIC_API_KEY=... node eval/datasets/run.js <task> [N=30] [file]
// tasks: qa | readlevel | translate | summarise   (files are written by prepare.py into eval/datasets/data/)
import fs from "node:fs";
import { runQa, runReadLevel, runTranslate, runSummarise } from "./lib.js";

const [task, n = "30", file] = process.argv.slice(2);
const dir = new URL("./data/", import.meta.url);
const load = (f) => fs.readFileSync(new URL(f, dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (x) => (x == null ? "n/a" : Math.round(x * 100) + "%");
const N = +n;
if (task === "qa") {
  const r = await runQa(load(file || "squad_v2.jsonl").slice(0, N));
  console.log(`Answerable: gold answer found ${pct(r.answerRate)} | wrongly refused ${r.falseRefusal}/${r.answerable}\nUnanswerable: correctly refused ${pct(r.refusalRate)} | fabricated an answer ${r.fabricated}/${r.unanswerable}`);
  r.misses.slice(0, 10).forEach((m) => console.log(" -", m.why, "|", m.q, m.got ? "| got: " + m.got : ""));
} else if (task === "readlevel") {
  const r = await runReadLevel(load(file || "onestop.jsonl"), {});
  console.log("OneStopEnglish grade level:", JSON.stringify(r.bands, (k, v) => (typeof v === "number" ? +v.toFixed(1) : v)), "\nOur levels on advanced texts:", JSON.stringify(r.ours, (k, v) => (typeof v === "number" ? +v.toFixed(1) : v)), r.ordered ? "\nOrdered correctly." : "\nWARNING: levels not ordered.");
} else if (task === "translate" || task === "summarise") {
  const rows = await (task === "translate" ? runTranslate : runSummarise)(load(file || (task === "translate" ? "translate.jsonl" : "summarise.jsonl")).slice(0, N));
  fs.writeFileSync(new URL(`out_${task}.jsonl`, dir), rows.map((r) => JSON.stringify(r)).join("\n"));
  console.log(`Wrote ${rows.length} rows to eval/datasets/data/out_${task}.jsonl. Now run: python score.py`);
} else console.log("tasks: qa | readlevel | translate | summarise");
