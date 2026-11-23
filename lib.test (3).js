import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCsv, scoreCase, runRow } from "./lib.js";

const rows = parseCsv(fs.readFileSync(new URL("./test_set.csv", import.meta.url), "utf8"));
test("template and sample rows parse", () => {
  assert.equal(rows.length, 7); assert.equal(rows[0].doc_id, "D001"); assert.equal(rows[0].target_language, "Hindi");
  assert.ok(rows[1].original_text_or_file.includes("Rs. 1,200"));
});
test("scoring finds items, flags misses and hallucinations", () => {
  const r = { explanation: ["Pay the fee."], warnings: [], actionSteps: ["Pay the fee on the online portal."], notFound: ["Refund rules", "Helpline number"],
    keyFacts: [{ label: "Fee", value: "Rs. 1,200", quote: "fee of Rs. 1,200" }, { label: "Deadline", value: "20 January 2027", quote: "on or before 20 January 2027" }] };
  const s = scoreCase(rows[1], r);
  assert.deepEqual(s.deadlines, [1, 1]); assert.deepEqual(s.notFound, [2, 2]); assert.equal(s.hallucinated, 0);
  const bad = scoreCase(rows[1], { ...r, keyFacts: [...r.keyFacts, { label: "Refund", value: "refund within 7 days", quote: "x" }] });
  assert.equal(bad.hallucinated, 1);
});
test("missing file rows are skipped, not failed", async () => assert.ok((await runRow(rows[0], {})).skip));
test("full row runs end to end with a mock model", async () => {
  const mk = (lang) => JSON.stringify({ title: "Notice", explanation: ["x"], keyFacts: [{ label: "Fee", value: "Rs. 1,200", quote: "fee of Rs. 1,200" }, { label: "Deadline", value: "20 January 2027", quote: "on or before 20 January 2027" }], difficultTerms: [], actionSteps: ["Pay the fee on the online portal."], notFound: ["Refund", "Helpline number"] });
  const o = await runRow(rows[1], { callModel: async () => mk() });
  assert.deepEqual(o.translation.digitsKept, [2, 2]); assert.deepEqual(o.content.miss, ["missing fact: pay on online portal", "missing fact: no admit card if unpaid"]);
});
