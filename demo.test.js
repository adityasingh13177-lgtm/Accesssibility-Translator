import test from "node:test";
import assert from "node:assert/strict";
import { simplifyOffline, answerOffline, sentences } from "../src/services/offline.js";
import { createServer } from "../src/demo-server.js";
import { norm } from "../src/services/validate.js";

const T = "NOTICE TO ALL APPLICANTS. The prescribed examination fee of Rs. 1,200 shall be remitted on or before 20 January 2027 through the online portal. Candidates who fail to pay by the due date shall not be issued an admit card. Fee once paid is non-transferable.";
test("sentences keep 'Rs. 1,200' together", () => assert.ok(sentences(T).some((s) => s.includes("Rs. 1,200 shall"))));
test("engine finds the deadline and fee, grounded in the text", () => {
  const r = simplifyOffline({ text: T });
  assert.ok(r.keyFacts.some((f) => f.label === "Deadline" && f.value === "20 January 2027"));
  assert.ok(r.keyFacts.some((f) => f.label === "Fee" && f.value === "Rs. 1,200"));
  r.keyFacts.forEach((f) => assert.ok(norm(T).includes(norm(f.quote))));
  assert.deepEqual(r.warnings, ["DEMO_ENGINE"]); assert.ok(r.notFound.includes("Refund rules"));
  assert.ok(!r.explanation.join(" ").includes("is cannot"));
});
test("no dates means Deadline is listed as not found", () => assert.ok(simplifyOffline({ text: "The office is open on weekdays. Visitors should bring a photo ID to enter the building." }).notFound.includes("Deadline")));
test("Q&A answers from the text and refuses otherwise", () => {
  assert.equal(answerOffline({ text: T, question: "How much is the fee?" }).found, true);
  assert.equal(answerOffline({ text: T, question: "Is there a refund?" }).found, false);
});
test("demo server: text works, English only, files are refused kindly", async () => {
  const s = createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); s.unref(); const base = `http://127.0.0.1:${s.address().port}`;
  const fd = new FormData(); fd.append("source", "txt"); fd.append("level", "Simple"); fd.append("language", "Hindi"); fd.append("text", T);
  const ok = await (await fetch(base + "/api/documents/process", { method: "POST", body: fd })).json();
  assert.equal(ok.language, "English"); assert.ok(ok.keyFacts.length >= 2); assert.ok(ok.original.includes("Rs. 1,200"));
  const f2 = new FormData(); f2.append("source", "pdf"); f2.append("file", new Blob(["%PDF-1.4"]), "a.pdf");
  const bad = await fetch(base + "/api/documents/process", { method: "POST", body: f2 }); assert.equal(bad.status, 422); assert.equal((await bad.json()).code, "DEMO_ONLY");
  const f3 = new FormData(); f3.append("source", "txt"); f3.append("text", "short");
  assert.equal((await (await fetch(base + "/api/documents/process", { method: "POST", body: f3 })).json()).code, "EMPTY_TEXT");
  const ask = await (await fetch(base + "/api/documents/x/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "When is the deadline?", text: T }) })).json();
  assert.equal(ask.found, true); const home = await fetch(base + "/"); assert.ok(home.ok); await home.text();
  s.closeAllConnections(); await new Promise((r) => s.close(r));
});

const BILL = "Electricity Bill. Bill no. 77310. Amount due: Rs. 2,340. Pay by 12 December 2026 to avoid a late fee of Rs. 100. You may pay at any city office or on the customer portal. Keep the receipt.";
test("bill: amounts get the right labels and all steps are found", () => {
  const r = simplifyOffline({ text: BILL });
  const f = Object.fromEntries(r.keyFacts.map((k) => [k.value, k.label]));
  assert.equal(f["Rs. 2,340"], "Amount due"); assert.equal(f["Rs. 100"], "Late fee"); assert.equal(f["12 December 2026"], "Deadline");
  assert.equal(r.actionSteps.length, 3); assert.ok(r.actionSteps.some((s) => /receipt/i.test(s)) && r.actionSteps.some((s) => /customer portal/i.test(s)));
  assert.ok(!r.notFound.includes("Late fee or penalty"));
});
