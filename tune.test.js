import test from "node:test";
import assert from "node:assert/strict";
import { tune, docScore } from "./tune.js";
import { eligible, makeExample } from "./promote.js";
import { scoreCase } from "./lib.js";

const T = (tag) => `[${tag}] NOTICE. The prescribed fee of Rs. 500 must be paid online before the due date through the portal. Candidates should keep the receipt safely.`;
const row = (id, tag) => ({ doc_id: id, doc_type: "t", source_language: "English", original_text_or_file: T(tag), true_key_facts: "Rs. 500", true_deadlines: "", true_steps: "Pay the fee online", not_in_document: "refund", target_language: "English" });
const rows = [row("A", "DEV"), row("B", "HELD"), row("C", "DEV"), row("D", "HELD")];
const out = (facts, steps, nf) => JSON.stringify({ title: "t", explanation: [facts ? "Pay Rs. 500." : "Please read the notice."], keyFacts: facts ? [{ label: "Fee", value: "Rs. 500", quote: "fee of Rs. 500" }] : [], difficultTerms: [], actionSteps: steps ? ["Pay the fee online."] : [], notFound: nf ? ["Refund rules"] : [] });
const mock = async ({ system, messages }) => {
  const dev = messages.at(-1).content.includes("[DEV]");
  if (system.includes("OVERFIT")) return dev ? out(1, 1, 1) : out(0, 0, 0);   // great on tuning rows, bad on held-out rows
  if (system.includes("STRICT")) return out(1, 1, 1);
  return out(1, 0, 0);
};
const V = (n, r) => ({ name: n, useExamples: false, extraRules: r });

test("a genuinely better variant is adopted", async () => {
  const r = await tune(rows, [V("baseline", ""), V("strict", "STRICT")], { callModel: mock });
  assert.equal(r.recommendation, "strict"); assert.ok(r.results[1].held > r.results[0].held);
});
test("a variant that only wins on the tuning half is rejected as overfitting", async () => {
  const r = await tune(rows, [V("baseline", ""), V("overfit", "OVERFIT"), V("strict", "STRICT")], { callModel: mock });
  assert.equal(r.recommendation, "baseline"); assert.ok(r.note.includes("overfitting"));
});
test("too few rows gives a clear message", async () => assert.ok((await tune(rows.slice(0, 2), [V("baseline", "")], { callModel: mock })).error));
test("only perfect, grounded outputs can become teaching examples", () => {
  const perfect = { title: "t", explanation: ["x"], keyFacts: [{ label: "Fee", value: "Rs. 500", quote: "fee of Rs. 500" }], difficultTerms: [], actionSteps: ["Pay the fee online."], notFound: ["Refund rules"], warnings: [] };
  const r0 = row("A", "DEV");
  assert.ok(eligible(scoreCase(r0, perfect)));
  assert.equal(eligible(scoreCase(r0, { ...perfect, notFound: [] })), false);
  assert.ok(makeExample(r0, T("DEV"), perfect));
  assert.equal(makeExample(r0, "A completely different text that never mentions the fee at all, so nothing is grounded.", perfect), null);
  assert.ok(docScore({ facts: [1, 1], deadlines: [0, 0], steps: [0, 1], notFound: [1, 1], hallucinated: 1, ungrounded: 0 }) < 0.5);
});
