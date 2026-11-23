import "./env.js";
// Fair A/B test of prompt variants on YOUR labeled rows, with a held-out half so we do not fool ourselves.
// Usage: ANTHROPIC_API_KEY=... node eval/tune.js [eval/test_set.csv] [level]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, runRow } from "./lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// One number per document: average recall over the checks that exist, minus penalties for invented or ungrounded facts.
export function docScore(c) {
  const parts = ["facts", "deadlines", "steps", "notFound"].filter((k) => c[k][1] > 0).map((k) => c[k][0] / c[k][1]);
  const recall = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 1;
  return Math.max(0, recall - 0.25 * c.hallucinated - 0.1 * c.ungrounded);
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export async function tune(rows, variants, { callModel, level = "Simple", minGain = 0.03 } = {}) {
  const usable = [];
  for (const r of rows) { const o = await runRow(r, { level, callModel, translate: false, simplifyOpts: { useExamples: false } }); if (!o.skip) usable.push(r); }
  if (usable.length < 4) return { error: `Need at least 4 labeled rows that can run (found ${usable.length}). 8 or more gives a trustworthy comparison.` };
  const dev = usable.filter((_, i) => i % 2 === 0), held = usable.filter((_, i) => i % 2 === 1), results = [];
  for (const v of variants) {
    const run = async (set) => avg(await Promise.all(set.map(async (r) => docScore((await runRow(r, { level, callModel, translate: false, simplifyOpts: { useExamples: v.useExamples, extraRules: v.extraRules } })).content))));
    results.push({ name: v.name, dev: await run(dev), held: await run(held) });
  }
  const base = results[0], best = [...results].sort((a, b) => b.dev - a.dev)[0];
  const adopt = best.name !== base.name && best.dev - base.dev >= minGain && best.held >= base.held;
  return { results, devRows: dev.length, heldRows: held.length, recommendation: adopt ? best.name : base.name,
    note: adopt ? `"${best.name}" beat the baseline on the tuning half AND did not get worse on the held-out half.`
      : best.name !== base.name && best.held < base.held ? `"${best.name}" looked better on the tuning half but WORSE on the held-out half: that is overfitting, so it was rejected.`
      : "No variant clearly beat the baseline. Keep it as it is." };
}

if (process.argv[1] && process.argv[1].endsWith("tune.js")) {
  const csv = process.argv[2] || path.join(here, "test_set.csv"), level = process.argv[3] || "Simple";
  const variants = JSON.parse(fs.readFileSync(path.join(here, "variants.json"), "utf8"));
  const r = await tune(parseCsv(fs.readFileSync(csv, "utf8")), variants, { level });
  if (r.error) { console.log(r.error); process.exit(1); }
  console.log(`Tuning rows: ${r.devRows} | held-out rows: ${r.heldRows}\n`);
  r.results.forEach((x) => console.log(`${x.name.padEnd(28)} tuning ${x.dev.toFixed(2)} | held-out ${x.held.toFixed(2)}`));
  console.log(`\nRecommendation: ${r.recommendation}\n${r.note}`);
  fs.writeFileSync(path.join(here, "tune_report.json"), JSON.stringify(r, null, 2));
}
