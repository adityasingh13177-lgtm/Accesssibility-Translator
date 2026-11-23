import "../env.js";
// Usage: ANTHROPIC_API_KEY=... node eval/asset/run_asset.js [asset_test.jsonl] [N=50]
// Runs all three reading levels, prints readability checks, and writes asset_out_<level>.jsonl for SARI scoring.
import fs from "node:fs";
import { cfg } from "../../server/src/config.js";
import { simplifySentence } from "../../server/src/services/llm.js";
import { fkgl, lengthRatio, numbersKept } from "./metrics.js";

export async function runLevels(items, { callModel } = {}) {
  const res = {};
  for (const level of cfg.levels) {
    const rows = [];
    for (const it of items) rows.push({ ...it, simplification: await simplifySentence({ text: it.original, level, callModel }) });
    const avg = (f) => { const v = rows.map(f).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    res[level] = { rows, fkglOriginal: avg((r) => fkgl(r.original)), fkgl: avg((r) => fkgl(r.simplification)), lengthRatio: avg((r) => lengthRatio(r.original, r.simplification)), numbersKept: avg((r) => numbersKept(r.original, r.simplification)) };
  }
  return res;
}

if (process.argv[1].endsWith("run_asset.js")) {
  const file = process.argv[2] || new URL("./asset_test.jsonl", import.meta.url).pathname, n = +process.argv[3] || 50;
  const items = fs.readFileSync(file, "utf8").trim().split("\n").slice(0, n).map((l) => JSON.parse(l));
  const res = await runLevels(items);
  for (const [level, r] of Object.entries(res)) {
    fs.writeFileSync(new URL(`./asset_out_${level.replace(" ", "_")}.jsonl`, import.meta.url), r.rows.map((x) => JSON.stringify(x)).join("\n"));
    console.log(`${level.padEnd(12)} grade level ${r.fkglOriginal.toFixed(1)} -> ${r.fkgl.toFixed(1)} | length x${r.lengthRatio.toFixed(2)} | numbers kept ${r.numbersKept == null ? "n/a" : Math.round(r.numbersKept * 100) + "%"}`);
  }
  const g = cfg.levels.map((l) => res[l].fkgl);
  console.log(g[0] <= g[1] && g[1] <= g[2] ? "Levels are ordered correctly (Very Simple easiest)." : "WARNING: levels are not ordered by difficulty. Tune LEVEL_RULES in prompts.js.");
}
