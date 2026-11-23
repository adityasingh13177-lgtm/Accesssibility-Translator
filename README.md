# Accessibility Translator

Turns a PDF, photo, web page or pasted text into a simple, translated explanation with key facts and next steps.
Website + API run together on one port. Open this folder in VS Code (File > Open Folder). English only for now.

## START HERE: run it in 30 seconds (nothing to install, no API key)
    npm run demo
Open http://localhost:4000, go to Workspace > Text, paste a notice and press Simplify.
This "demo mode" uses a simple rule-based engine (not AI) and reads pasted text only. Every key fact is still quoted from your text.
For AI-quality results and PDF / photo / web-link support, follow steps 1 to 3 below.

## FREE real AI on your own computer (no API key, no payment): Ollama
Recommended model for a laptop with a 6 GB GPU (for example RTX 3050): **qwen3.5:4b** (about 2.7 GB, English, fits with room for long notices).
It runs on your machine, so your documents never leave it. Windows steps, in a terminal inside this folder:

    1. Install Ollama from https://ollama.com and start it.
    2. ollama pull qwen3.5:4b
    3. npm run setup                              (once)
    4. copy server\.env.example server\.env        (once; it is already set to Ollama)
    5. npm run ollama:check                        (runs your real pipeline once and tells you if it works, how fast, and if it uses the GPU)
    6. npm start                                   then open http://localhost:4000

How it works: the app talks to Ollama's own API, turns "thinking" off (faster answers), and gives the model the exact JSON shape it must return
(`server/src/services/schemas.js`). Every key fact is still quoted from your text and checked, so a small model cannot slip in invented facts: they are dropped.
If `npm run ollama:check` says part of the model is on the CPU, set `OLLAMA_NUM_CTX=8192` in `server/.env`.
Other model to try if you want to compare: `OLLAMA_MODEL=gemma4:e4b` (use `OLLAMA_NUM_CTX=8192`). Switch engine any time with `LLM_PROVIDER=ollama | anthropic | openai` (see `server/.env.example`).
Honest limit: a 4B local model is weaker than a large cloud model. Expect simpler wording and sometimes "We couldn't prepare your results this time": press the button again.

## What works now, and what is still a demo
| Part | Status |
|---|---|
| Website (landing, workspace, results, library, settings, sign-in pages) | Works. |
| Pasted text -> real AI result, key facts checked against the text, grounded Q&A | Works once you pick an AI engine: free local Ollama, an Anthropic key, or an OpenAI-compatible service. |
| PDF / image / web link | Works once the Python extractor is also running (see step 3). |
| Sign-in, library, saved results | DEMO ONLY: stored in your browser. The API uses a stub login. Replace it with your real login before going live. |

## 1. One-time setup
Install Node 18 or newer (https://nodejs.org). Then in the VS Code terminal (Terminal > New Terminal):

    npm run setup
    copy server\.env.example server\.env        (Windows)     cp server/.env.example server/.env     (Mac/Linux)

Open `server/.env`. It is set to the free local AI (Ollama, see above). To use Claude instead, set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=` to your key. Leave `MONGO_URI` empty for now.

## 2. Run the website and API
    npm start
Open http://localhost:4000. Use the Text tab first: paste a notice, press "Simplify & Translate".
(Or press F5 in VS Code and choose "Run website + API".)

## 3. Optional: PDF, image and web-link support
Install Python 3.10+, Tesseract OCR (English is included by default) and Poppler. Then in a second terminal:

    python -m venv .venv
    .venv\Scripts\activate            (Windows)       source .venv/bin/activate    (Mac/Linux)
    pip install -r extractor/requirements.txt
    npm run extractor
Make sure `INTERNAL_KEY` in `server/.env` is any long random text. Restart `npm start` after editing `.env`.

## Score your engine on 10 sample notices
    node eval/run_eval.js eval/sample_notices_test_set.csv        (run it from this top folder)
Uses whichever engine is set in `server/.env` (Ollama, Anthropic or OpenAI-compatible). Rows D109 and D110 read a PDF and a photo, so start the Python reader first (step 3); skip them otherwise.

## 4. Run the tests (no key, no internet needed)
    npm test
Covers the validation and fact-checking, long-document splitting, Q&A rules, the Ollama connection (against a fake Ollama), scoring tools and dataset runners (all with a fake model).

## Folder map
- `frontend/index.html`  the whole website (one file). Settings at the top of its script: `CFG`.
- `server/`  Express API: `src/routes/documents.js` (endpoints), `src/services/llm.js` (AI steps), `src/prompts.js` (the prompt to tune).
- `extractor/`  Python reader for PDF, OCR and web pages (also blocks unsafe links).
- `eval/`  your test sets and scorers. See `eval/datasets/DATASETS.md` and `docs/BACKEND.md`.

## Going live (what you must still do)
1. Replace the stub login in `server/src/index.js` with your real login, and set `CFG.mock=false` in `frontend/index.html`.
2. Confirm the API routes match (listed in `docs/BACKEND.md`).
3. Add rate limiting in front of `/api/documents/process`, and keep the API key only on the server.
4. Check the licence of every dataset before any commercial use, and never copy dataset text into the product.

## Honest limits
The Express server, the Python extractor with Indian-language OCR, and live AI calls (including a real Ollama model) were NOT run while this was built
(no network, GPU or packages there). The Ollama connection was tested against a fake Ollama only, so expect small first-run fixes.
The website, the fact-checking logic, the demo server and the test tools were run.

## If http://localhost:4000 says "refused to connect"
That means the server is not running. Run `npm run doctor`: it tells you exactly what is missing. Then:
1. Run `npm start` and LEAVE THAT TERMINAL OPEN. It must print "Open http://localhost:4000". Closing the terminal stops the site.
2. If it prints a red error instead, read the first line: "Cannot find package ..." means run `npm run setup` first.
3. Make sure the terminal is inside the project folder (the one that contains `frontend` and `server`).
4. Do not double-click `index.html` or use Live Server for the full app: the API only exists when `npm start` is running.

## Learning loop (add-on): how the app improves from YOUR checked data
This does not retrain the AI model. It makes the app better in three safe ways, using only documents you have labeled yourself.

1. **Label documents** in `eval/test_set.csv` (key facts, deadlines, steps, what is NOT in the document). 8 or more rows is a good start.
2. **Teach it:** `npm --prefix server run promote -- D002`
   Runs the app on that row. Only if the output matches your labels perfectly (nothing invented, every fact quoted from the document)
   it asks "add as a teaching example? (y/n)". Approved examples go to `server/examples/approved.jsonl`.
   From then on, a new document that looks similar (same language) is shown the closest approved examples before it is processed.
3. **Test changes fairly:** `npm --prefix server run tune`
   Compares prompt variants from `eval/variants.json` (with/without your examples, stricter "not found" rule, and so on). Half your rows are used
   to choose, the other half are held out. A variant is only recommended if it wins AND is not worse on the held-out half, so you
   are protected from changes that only look good on the data they were tuned on.

Rules: the examples file contains your documents' text, so do not share or commit it (it is in `.gitignore`). Only add documents you are
allowed to use; do not add text from third-party datasets. Nothing is saved from real users' documents.
