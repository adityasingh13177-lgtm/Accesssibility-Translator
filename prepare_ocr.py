"""Writes a manifest of line images + true text for ocr_lines.py.
  python prepare_ocr.py sroie [N=300]            # cropped receipt lines (English), from priyank-m/SROIE_2019_text_recognition
  python prepare_ocr.py folder <dir> <lang>      # any folder with images + a labels.jsonl of {"image","text"} (e.g. the Indic synthetic OCR benchmark)
Output: data/ocr/<name>.jsonl with {"image": path, "text": truth, "lang": tesseract-lang}"""
import json, os, random, sys
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "ocr"); os.makedirs(OUT, exist_ok=True)
def write(name, rows):
    with open(os.path.join(OUT, name + ".jsonl"), "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"wrote {len(rows)} rows to data/ocr/{name}.jsonl")
kind = sys.argv[1] if len(sys.argv) > 1 else ""
if kind == "sroie":
    from datasets import load_dataset
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 300
    ds = load_dataset("priyank-m/SROIE_2019_text_recognition", split="test")
    idx = list(range(len(ds))); random.Random(7).shuffle(idx); rows = []
    os.makedirs(os.path.join(OUT, "sroie"), exist_ok=True)
    for i in idx[:n]:
        p = os.path.join(OUT, "sroie", f"{i}.png"); ds[i]["image"].convert("RGB").save(p); rows.append({"image": p, "text": ds[i]["text"], "lang": "eng"})
    write("sroie", rows)
elif kind == "folder":
    d, lang = sys.argv[2], sys.argv[3]
    rows = [json.loads(l) for l in open(os.path.join(d, "labels.jsonl"), encoding="utf-8") if l.strip()]
    for r in rows: r["image"] = os.path.join(d, r["image"]); r["lang"] = lang
    write(os.path.basename(os.path.normpath(d)), rows)
else: sys.exit(__doc__)
