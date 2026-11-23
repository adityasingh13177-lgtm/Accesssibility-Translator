// JSON Schemas for the model's reply. Ollama uses them to FORCE a valid shape (grammar-constrained decoding),
// which makes small local models far more reliable. They mirror validateResult() in validate.js.
const str = { type: "string" };
const arr = (items, max) => ({ type: "array", items, ...(max ? { maxItems: max } : {}) });

export const RESULT_SCHEMA = {
  type: "object",
  properties: {
    title: str,
    explanation: arr(str, 3),
    keyFacts: arr({ type: "object", properties: { label: str, value: str, quote: str }, required: ["label", "value", "quote"] }, 8),
    difficultTerms: arr({ type: "object", properties: { term: str, meaning: str }, required: ["term", "meaning"] }, 6),
    actionSteps: arr(str, 7),
    notFound: arr(str, 5),
  },
  required: ["title", "explanation", "keyFacts", "difficultTerms", "actionSteps", "notFound"],
};

export const QA_SCHEMA = {
  type: "object",
  properties: { found: { type: "boolean" }, answer: str, quote: str },
  required: ["found", "answer", "quote"],
};
