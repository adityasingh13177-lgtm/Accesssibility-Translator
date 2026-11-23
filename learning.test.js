import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { similarity, acceptExample, loadExamples, pickExamples } from "../src/examples.js";
import { simplify } from "../src/services/llm.js";

const BILL = "Municipal Water Supply. Bill no. 44821. Amount due: Rs. 745. Pay by 05 March 2027 to avoid a surcharge of 2% per month on the outstanding amount.";
const OUT = { title: "Water bill", explanation: ["Pay Rs. 745 by 05 March 2027."], keyFacts: [{ label: "Amount", value: "Rs. 745", quote: "Amount due: Rs. 745" }, { label: "Deadline", value: "05 March 2027", quote: "Pay by 05 March 2027" }], difficultTerms: [], actionSteps: ["Pay the bill."], notFound: ["Helpline number"] };
const SIMILAR = "Municipal Water Supply. Bill no. 55120. Amount due: Rs. 810. Pay by 10 April 2027 to avoid a surcharge of 2% per month on the outstanding amount.";
const OTHER = "Candidates must bring an admit card to the examination hall on the first day of the examination.";
const good = (t) => JSON.stringify({ title: "t", explanation: ["Pay Rs. 810."], keyFacts: [{ label: "Amount", value: "Rs. 810", quote: "Amount due: Rs. 810" }], difficultTerms: [], actionSteps: [], notFound: [] });

test("good examples are accepted, bad ones rejected", () => {
  assert.ok(acceptExample({ text: BILL, output: OUT }));
  const fake = { ...OUT, keyFacts: [{ label: "Late fee", value: "Rs. 50", quote: "late fee of Rs. 50 applies" }] };
  assert.equal(acceptExample({ text: BILL, output: fake }), null);
  assert.equal(acceptExample({ text: "too short", output: OUT }), null);
});
test("loader skips broken lines and ungrounded examples", () => {
  const f = path.join(os.tmpdir(), `ex-${Date.now()}.jsonl`);
  fs.writeFileSync(f, [JSON.stringify({ text: BILL, output: OUT }), "not json", JSON.stringify({ text: BILL, output: { ...OUT, keyFacts: [{ label: "x", value: "Rs. 9", quote: "never said" }] } })].join("\n"));
  assert.equal(loadExamples(f).length, 1);
  assert.deepEqual(loadExamples(path.join(os.tmpdir(), "missing.jsonl")), []);
});
test("picks similar examples only, in the right language", () => {
  const ex = [acceptExample({ text: BILL, output: OUT })];
  assert.ok(similarity(SIMILAR, BILL) > 0.4); assert.ok(similarity(OTHER, BILL) < 0.12);
  assert.equal(pickExamples(SIMILAR, { examples: ex }).length, 1);
  assert.equal(pickExamples(OTHER, { examples: ex }).length, 0);
  assert.equal(pickExamples(SIMILAR, { language: "Hindi", examples: ex }).length, 0);
});
test("simplify shows the approved example, or the built-in one", async () => {
  const ex = [acceptExample({ text: BILL, output: OUT })];
  let msgs;
  const spy = async ({ messages }) => { msgs = messages; return good(); };
  await simplify({ text: SIMILAR, level: "Simple", language: "English", callModel: spy, examples: ex });
  assert.equal(msgs.filter((m) => m.role === "assistant").length, 1); assert.ok(msgs.find((m) => m.role === "assistant").content.includes("Water bill"));
  await simplify({ text: SIMILAR, level: "Simple", language: "English", callModel: spy, examples: ex, useExamples: false });
  assert.ok(msgs.find((m) => m.role === "assistant").content.includes("Application fee notice"));
  await simplify({ text: OTHER + " " + OTHER, level: "Simple", language: "English", callModel: spy, examples: ex });
  assert.ok(msgs.find((m) => m.role === "assistant").content.includes("Application fee notice"));
});
test("extra rules reach the system prompt", async () => {
  let sys; await simplify({ text: SIMILAR, level: "Simple", language: "English", extraRules: "7. EXTRA-RULE-MARKER", callModel: async ({ system }) => { sys = system; return good(); } });
  assert.ok(sys.includes("EXTRA-RULE-MARKER"));
});
