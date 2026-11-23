import express from "express";
import multer from "multer";
import { cfg } from "../config.js";
import { AppError } from "../errors.js";
import { checkUpload } from "../services/files.js";
import { extractFile, extractUrl, cleanText } from "../services/extract.js";
import { simplify, answerQuestion } from "../services/llm.js";

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!(e instanceof AppError)) console.error(e);
  res.status(e.status || 500).json({ message: e.userMessage || "Something went wrong. Please try again.", code: e.code || "SERVER_ERROR" });
});
// UI sends e.g. "\u0939\u093f\u0928\u094d\u0926\u0940 (Hindi)"; the model gets the English name in brackets.
const langName = (s) => { const n = (String(s || "").match(/\(([A-Za-z]+)\)/) || [, String(s || "English").replace(/[^A-Za-z]/g, "")])[1]; return cfg.languages.includes(n) ? n : "English"; };

// auth = { optional, required } are YOUR existing middlewares; Doc = your Mongoose model.
// Mount with: app.use("/api/documents", documentsRouter({ auth, Doc }))  and  app.use("/api/results", resultsRouter({ auth, Doc })).
export function documentsRouter({ auth, Doc, callModel }) {
  const r = express.Router();
  const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxFileBytes, files: 1 } });

  r.post("/process", auth.optional, up.single("file"), wrap(async (req, res) => {
    const { source, url, text: pasted } = req.body;
    const level = cfg.levels.includes(req.body.level) ? req.body.level : "Simple";
    const language = langName(req.body.language);
    const warnings = [];
    let text, title;

    if (source === "pdf" || source === "img") {
      const kind = checkUpload(req.file, source);
      const ex = await extractFile(req.file, kind === "pdf" ? "pdf" : "img");
      text = ex.text; title = req.file.originalname;
      if (ex.confidence != null && ex.confidence < 55) warnings.push("BLURRY");
      if (ex.method === "ocr") warnings.push("OCR_USED");
    } else if (source === "url") {
      if (!/^https?:\/\//i.test(url || "")) throw new AppError("BAD_URL", "Please enter a full web address starting with https://");
      const ex = await extractUrl(url); text = ex.text; title = ex.title || new URL(url).hostname;
    } else if (source === "txt") { text = pasted; title = "Pasted text"; }
    else throw new AppError("BAD_SOURCE", "Please choose how you want to add your document.");

    text = cleanText(text);
    if (text.length < cfg.minChars) throw new AppError("EMPTY_TEXT", "We couldn\u2019t find enough readable text. Try a clearer file or paste the text.", 422);
    if (text.length > cfg.maxDocChars) { text = text.slice(0, cfg.maxDocChars); warnings.push("TRUNCATED"); }

    const out = await simplify({ text, level, language, callModel });
    const result = { ...out, warnings: [...warnings, ...out.warnings] };
    let id = "g" + Date.now();
    if (req.user && Doc) {
      const d = await Doc.create({ owner: req.user.id, title: out.title || title, source, level, language, sourceText: text, result });
      id = String(d._id);
    }
    res.json({ id, level, language, ...result, title: out.title || title, original: text.slice(0, 4000) });
  }));

  // Grounded Q&A. Signed-in users ask about a stored document; guests send the text back.
  r.post("/:id/ask", auth.optional, express.json({ limit: "200kb" }), wrap(async (req, res) => {
    const question = String(req.body.question || "").trim().slice(0, 300);
    if (!question) throw new AppError("NO_QUESTION", "Please type a question.");
    let text = req.body.text;
    if (req.user && Doc) {
      const d = await Doc.findOne({ _id: req.params.id, owner: req.user.id }).select("+sourceText");
      if (d) text = d.sourceText;
    }
    if (!text) throw new AppError("NO_DOC", "We couldn\u2019t find that document.", 404);
    res.json(await answerQuestion({ text: String(text).slice(0, cfg.maxDocChars), question, language: langName(req.body.language), callModel }));
  }));

  r.get("/", auth.required, wrap(async (req, res) => {
    const items = await Doc.find({ owner: req.user.id }).sort("-createdAt").limit(100);
    res.json({ items: items.map((d) => ({ id: d.id, title: d.title, type: d.source, level: d.level, language: d.language, created: d.createdAt, doc: { id: d.id, ...d.result } })) });
  }));
  r.delete("/", auth.required, express.json(), wrap(async (req, res) => { await Doc.deleteOne({ _id: req.body.id, owner: req.user.id }); res.json({ ok: 1 }); }));
  return r;
}

export function resultsRouter({ auth, Doc }) {
  const r = express.Router();
  const set = (saved) => wrap(async (req, res) => { await Doc.updateOne({ _id: req.body.id, owner: req.user.id }, { saved }); res.json({ ok: 1 }); });
  r.get("/saved", auth.required, wrap(async (req, res) => {
    const items = await Doc.find({ owner: req.user.id, saved: true }).sort("-updatedAt");
    res.json({ items: items.map((d) => ({ id: d.id, title: d.title, level: d.level, language: d.language, created: d.updatedAt, doc: { id: d.id, ...d.result } })) });
  }));
  r.post("/saved", auth.required, express.json(), set(true));
  r.delete("/saved", auth.required, express.json(), set(false));
  return r;
}
