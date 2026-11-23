# Accessibility Translator: backend (Phase 5)

Browser (React) -> Node/Express API -> Python extractor (PDF / OCR / URL) -> AI model -> checked JSON -> browser

## Run it
1. System packages: `tesseract-ocr` with language packs (hin ben mar tam tel guj kan pan) and `poppler-utils`.
2. Extractor: `cd extractor && pip install -r requirements.txt && INTERNAL_KEY=... uvicorn app:app --port 8001`
3. API: copy `.env.example` to `server/.env`, fill the values, then `cd server && npm install && npm start`
4. Tests (no network or key needed): `cd server && npm test`
5. Quality check on your samples: `cd server && npm run eval` (needs the API key)

## Wire it into YOUR existing server
Mount the routers in your current app and pass YOUR auth middleware and Document model:
    app.use("/api/documents", documentsRouter({ auth: { optional, required }, Doc }));
    app.use("/api/results",   resultsRouter({ auth: { optional, required }, Doc }));
`src/index.js` is only a dev server with a stub login. Keep your own rate limiting in front of `/process`.

## API contract (matches the front end)
POST /api/documents/process  (multipart: source=pdf|img|url|txt, level, language, file | url | text)
  -> { id, title, level, language, explanation[], keyFacts[{label,value,quote}], difficultTerms[], actionSteps[], notFound[], warnings[], original }
POST /api/documents/:id/ask  { question, language, text? } -> { found, answer, quote }
GET/DELETE /api/documents, GET/POST/DELETE /api/results/saved
Errors always look like { message, code } with a plain-language message.
Warnings: BLURRY (low OCR confidence), OCR_USED, TRUNCATED.

## Why the answers can be trusted
- The model may only use the document; anything missing goes to "not found".
- Every key fact must include an exact quote. The server drops any fact whose quote is not in the document, or whose numbers are not in that quote.
- Q&A answers need a real quote too, otherwise: "This is not mentioned in the document."
- Output is validated, retried once if invalid, and documents are wrapped so text inside them cannot give commands.
- Long documents are split, analysed part by part with a short running summary, then merged.

## About "training the model"
This project does not train or fine-tune a model. It improves results with a strict prompt, a worked example,
server-side checks and a measurable test set. To improve it: add real public notices (government circulars,
bills, forms, exam notices you are allowed to use) as rows in `eval/test_set.csv` (files go in `eval/files/`), run `npm run eval`, and adjust
`src/prompts.js` until the four scores rise. Fine-tuning would need a large licensed, human-checked dataset
and is only worth considering after this loop stops improving.

## Benchmark on ASSET (optional)
ASSET (facebook/asset) is an English sentence-simplification EVALUATION set: 359 test sentences, 10 human simplifications each, no training split.
Its card shows conflicting licence labels (CC BY-SA in the header, CC BY-NC 4.0 in the text) and says research use only, so use it only
to measure, never copy its sentences into the product, prompts or this zip, and check the licence before any commercial use.
    cd eval/asset && pip install datasets evaluate sacrebleu && python prepare_asset.py 100
    cd ../../server && npm run asset            # needs ANTHROPIC_API_KEY; prints grade level, length and numbers kept per level
    cd ../eval/asset && python score_asset.py   # SARI against the human references
ASSET covers only English Wikipedia sentences, so it checks wording quality and that the three levels really get easier. It cannot judge
facts, deadlines, translation or Indian languages: your own `test_set.csv` does that.

## Benchmark datasets (optional)
`eval/datasets/DATASETS.md` lists nine public datasets (SQuAD v2, IndicQA, OneStopEnglish, FLORES-200, IN22-Gen, Samanantar, XL-Sum,
IndicSentenceSummarization, FUNSD, WikiLarge) with licences, caveats and how to run each. They are for TESTING only.

OCR line tests: `eval/datasets/prepare_ocr.py` and `ocr_lines.py` (see eval/datasets/DATASETS.md). They are for TESTING and for choosing the blurry-scan threshold, not training.
