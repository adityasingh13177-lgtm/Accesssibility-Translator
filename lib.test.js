import test from "node:test";
import assert from "node:assert/strict";
import { runQa, runReadLevel, runTranslate } from "./lib.js";

const ctx = "The fee is Rs. 500 and must be paid before 30 November 2026.";
test("QA answers, refuses and catches fabrication", async () => {
  const mock = async ({ messages }) => {
    const q = messages.at(-1).content.split("<question>")[1];
    if (q.includes("fee")) return JSON.stringify({ found: true, answer: "Rs. 500", quote: "The fee is Rs. 500" });
    if (q.includes("refund")) return JSON.stringify({ found: true, answer: "7 days", quote: "refund within 7 days" }); // fake quote -> must be refused
    return JSON.stringify({ found: false, answer: "", quote: "" });
  };
  const r = await runQa([
    { context: ctx, question: "How much is the fee?", answers: ["Rs. 500"], answerable: true, lang: "en" },
    { context: ctx, question: "What is the refund period?", answers: [], answerable: false, lang: "en" },
    { context: ctx, question: "Who signed it?", answers: [], answerable: false, lang: "en" }], { callModel: mock });
  assert.equal(r.hit, 1); assert.equal(r.refused, 2); assert.equal(r.fabricated, 0);
});
test("read-level bands and ordering", async () => {
  const items = [{ text: "The cat sat. It was warm. We ran home.", level: 0 }, { text: "The committee subsequently disseminated comprehensive regulations concerning municipal infrastructure.", level: 2 }];
  const good = (txt) => JSON.stringify({ title: "t", explanation: [txt], keyFacts: [], difficultTerms: [], actionSteps: [], notFound: [] });
  const mock = async ({ system }) => good(system.includes("10-year-old") ? "It is simple." : system.includes("under 18") ? "The group shared the rules about the town." : "The committee later published comprehensive regulations about municipal infrastructure.");
  const r = await runReadLevel(items, { callModel: mock });
  assert.ok(r.ordered); assert.ok(r.bands.advanced > r.bands.elementary);
});
test("translation rows keep source and reference", async () => {
  const rows = await runTranslate([{ src: "Pay the fee.", ref: "x", tgt: "hin_Deva" }], { callModel: async ({ system }) => (system.includes("Hindi") ? "शुल्क जमा करें।" : "?") });
  assert.equal(rows[0].hyp, "शुल्क जमा करें।"); assert.equal(rows[0].ref, "x");
});
