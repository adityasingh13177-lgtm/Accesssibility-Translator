import test from "node:test";
import assert from "node:assert/strict";
import { fkgl, lengthRatio, numbersKept } from "./metrics.js";
import { runLevels } from "./run_asset.js";

const hard = "Notwithstanding the aforementioned provisions, the municipality subsequently disseminated the revised regulations in 2009.";
const easy = "The town shared the new rules in 2009.";
test("harder text has a higher grade level", () => assert.ok(fkgl(hard) > fkgl(easy) + 5));
test("numbers kept", () => { assert.equal(numbersKept(hard, easy), 1); assert.equal(numbersKept(hard, "The town shared rules."), 0); assert.equal(numbersKept("No digits here", "x"), null); });
test("length ratio", () => assert.ok(lengthRatio(hard, easy) < 0.7));
test("runs all three levels with a mock model", async () => {
  const mock = async ({ system }) => (system.includes("10-year-old") ? "The town shared new rules in 2009." : system.includes("under 18") ? "The town shared the new rules in 2009 after a delay." : "The municipality later published the revised regulations in 2009.");
  const r = await runLevels([{ original: hard, references: [easy] }], { callModel: mock });
  assert.deepEqual(Object.keys(r), ["Very Simple", "Simple", "Standard"]);
  assert.ok(r["Very Simple"].fkgl <= r["Standard"].fkgl); assert.equal(r["Simple"].numbersKept, 1);
});
