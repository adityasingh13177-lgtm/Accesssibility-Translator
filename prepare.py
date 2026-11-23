"""Downloads small samples of the benchmark datasets and writes them in the formats run.js / score.py expect.
Usage:  pip install "datasets<4" && python prepare.py <name> [N=200] [lang]
names:  squad | indicqa | onestop | wikilarge | flores | in22 | xlsum | indicsum | samanantar | funsd
Notes:  several repos still use loading scripts, so use datasets<4 (or trust_remote_code=True). IN22-Gen is GATED: run
        `huggingface-cli login` and accept its terms first. Licences differ per dataset: read DATASETS.md before any use."""
import json, os, random, sys
from datasets import load_dataset

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"); os.makedirs(OUT, exist_ok=True)
CODES = ["hin_Deva", "ben_Beng", "mar_Deva", "tam_Taml", "tel_Telu", "guj_Gujr", "kan_Knda", "pan_Guru"]
def ld(*a, **k):
    try: return load_dataset(*a, **k)
    except Exception as e:
        sys.exit(f"Could not load {a}: {e}\nTry: pip install 'datasets<4'  (script-based repo) or log in for gated data.")
def write(name, rows):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} rows to data/{name}")
def sample(ds, n, seed=7):
    idx = list(range(len(ds))); random.Random(seed).shuffle(idx); return [ds[i] for i in idx[:n]]

name = sys.argv[1] if len(sys.argv) > 1 else ""; N = int(sys.argv[2]) if len(sys.argv) > 2 else 200; lang = sys.argv[3] if len(sys.argv) > 3 else "hi"

if name == "squad":            # answerable + unanswerable, half each
    ds = ld("rajpurkar/squad_v2", split="validation")
    rows = [{"context": r["context"], "question": r["question"], "answers": r["answers"]["text"], "answerable": len(r["answers"]["text"]) > 0, "lang": "en"} for r in sample(ds, N * 4)]
    a = [r for r in rows if r["answerable"]][: N // 2]; u = [r for r in rows if not r["answerable"]][: N // 2]
    random.Random(1).shuffle(a := a + u); write("squad_v2.jsonl", a)
elif name == "indicqa":        # config name may differ: the script prints the valid ones on failure
    ds = ld("ai4bharat/IndicQA", f"indicqa.{lang}", split="test", trust_remote_code=True)
    write(f"indicqa_{lang}.jsonl", [{"context": r["context"], "question": r["question"], "answers": r["answers"]["text"], "answerable": len([t for t in r["answers"]["text"] if t.strip()]) > 0, "lang": lang} for r in sample(ds, N)])
elif name == "onestop":        # level: 0 elementary, 1 intermediate, 2 advanced
    ds = ld("iastate/onestop_english", split="train"); write("onestop.jsonl", [{"text": r["text"], "level": r["label"]} for r in sample(ds, N * 3)])
elif name == "wikilarge":      # noisy single reference: use only as a rough second opinion next to ASSET
    ds = None
    for sp in ("test", "validation", "train"):
        try: ds = load_dataset("waboucay/wikilarge", split=sp, trust_remote_code=True); break
        except Exception: continue
    if ds is None: sys.exit("Could not load waboucay/wikilarge (script-based; try datasets<4)")
    write("wikilarge.jsonl", [{"original": r["complex"], "references": [r["simple"]]} for r in sample(ds, N)])
elif name in ("flores", "in22"):   # English -> 8 Indic languages
    rows = []
    for c in CODES:
        if name == "flores": ds = ld("Muennighoff/flores200", f"eng_Latn-{c}", split="devtest", trust_remote_code=True)
        else: ds = ld("ai4bharat/IN22-Gen", f"eng_Latn-{c}", split="gen", trust_remote_code=True)
        rows += [{"src": r["sentence_eng_Latn"], "ref": r[f"sentence_{c}"], "tgt": c, "set": name} for r in sample(ds, N // len(CODES) + 1)]
    write("translate.jsonl", rows)
elif name == "xlsum":          # BBC articles; non-commercial licence; Hindi/Bengali/Marathi/Tamil/Telugu/Gujarati/Punjabi exist
    lg = {"hi": "hindi", "bn": "bengali", "mr": "marathi", "ta": "tamil", "te": "telugu", "gu": "gujarati", "pa": "punjabi", "en": "english"}[lang]
    ds = ld("csebuetnlp/xlsum", lg, split="test", trust_remote_code=True)
    write("summarise.jsonl", [{"text": r["text"][:3000], "summary": r["summary"], "lang": lang} for r in sample(ds, N)])
elif name == "indicsum":       # sentence -> headline (NOT document summaries); noisy targets were visible in the viewer
    ds = ld("ai4bharat/IndicSentenceSummarization", lang, split="test")
    write("summarise.jsonl", [{"text": r["input"], "summary": r["target"], "lang": lang} for r in sample(ds, N)])
elif name == "samanantar":     # mined corpus: visibly contains mismatched pairs. Hand-check ~100 pairs before trusting any score.
    it = ld("ai4bharat/samanantar", lang, split="train", streaming=True); rows = []
    for r in it:
        s, t = r["src"], r["tgt"]
        if 40 <= len(s) <= 220 and 0.6 <= len(t) / len(s) <= 1.6: rows.append({"src": s, "ref": t, "tgt": lang, "set": "samanantar", "data_source": r.get("data_source")})
        if len(rows) >= N * 5: break
    write("translate_samanantar.jsonl", sample(rows, N))
elif name == "funsd":          # form images + word boxes + header/question/answer tags; run ocr_funsd.py afterwards
    ds = ld("florianbussmann/FUNSD-vu2020revising", split="test", trust_remote_code=True)
    write("funsd.jsonl", [{"image": r["image_path"], "words": r["words"], "tags": r["ner_tags"]} for r in ds])
else:
    sys.exit(__doc__)
