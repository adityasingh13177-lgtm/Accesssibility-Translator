"""Builds Q&A test files from your language zips (Indic SQuAD v2 style) WITHOUT unzipping them.
Usage: python prepare_indicsquad.py <folder-with-the-zips> [N=60] [split=validation]
Reads each '<Language>-...zip', takes the validation file (or test), picks N questions half answerable / half unanswerable,
and writes data/indicsquad_<code>.jsonl.  Then:  cd ../../server && npm run ds -- qa 60 indicsquad_hi.jsonl"""
import glob, io, json, os, random, sys, zipfile
CODE = {"Hindi": "hi", "Bengali": "bn", "Gujarati": "gu", "Kannada": "kn", "Malayalam": "ml", "Marathi": "mr", "Oriya": "or", "Punjabi": "pa", "Tamil": "ta", "Telugu": "te"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"); os.makedirs(OUT, exist_ok=True)
folder = sys.argv[1] if len(sys.argv) > 1 else "."; N = int(sys.argv[2]) if len(sys.argv) > 2 else 60; split = sys.argv[3] if len(sys.argv) > 3 else "validation"
want = ("val",) if split.startswith("val") else ("test",)
for z in sorted(glob.glob(os.path.join(folder, "*.zip"))):
    lang = os.path.basename(z).split("-")[0]
    if lang not in CODE: continue
    with zipfile.ZipFile(z) as zf:
        names = [n for n in zf.namelist() if n.lower().endswith(".json") and os.path.basename(n).lower().startswith(want) and "gold" not in n.lower()]
        if not names: print(f"{lang}: no {split} file in zip"); continue
        d = json.load(io.TextIOWrapper(zf.open(names[0]), encoding="utf-8"))
    if isinstance(d, dict): d = d.get("data", [])          # Marathi files wrap the list as {"data": [...]}
    rows = [{"context": r["context"], "question": r["question"], "answers": r["answers"]["text"], "answerable": len(r["answers"]["text"]) > 0, "lang": CODE[lang]} for r in d]
    rnd = random.Random(7); a = [r for r in rows if r["answerable"]]; u = [r for r in rows if not r["answerable"]]
    rnd.shuffle(a); rnd.shuffle(u); pick = a[: N // 2] + u[: N // 2]; rnd.shuffle(pick)
    with open(os.path.join(OUT, f"indicsquad_{CODE[lang]}.jsonl"), "w", encoding="utf-8") as f:
        for r in pick: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{lang:10} {os.path.basename(names[0]):26} {len(rows):>6} questions, {100*len(a)//len(rows)}% answerable -> data/indicsquad_{CODE[lang]}.jsonl ({len(pick)} rows)")
