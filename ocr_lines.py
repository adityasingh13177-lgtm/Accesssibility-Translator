"""Line-level OCR check with the same engine as the extractor. Usage: python ocr_lines.py data/ocr/sroie.jsonl [N=200]
Prints character error rate (CER) overall and per confidence bucket, so you can pick the 'blurry scan' threshold from evidence."""
import json, sys
import pytesseract
from PIL import Image
def cer(ref, hyp):
    a, b = ref, hyp
    if not a: return 0.0 if not b else 1.0
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1): cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1] / len(a)
path = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 200
rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()][:n]; res = []
for r in rows:
    img = Image.open(r["image"]).convert("RGB")
    d = pytesseract.image_to_data(img, lang=r.get("lang", "eng"), config="--psm 7", output_type=pytesseract.Output.DICT)
    words = [(w, float(c)) for w, c in zip(d["text"], d["conf"]) if w.strip() and float(c) >= 0]
    hyp = " ".join(w for w, _ in words); conf = sum(c for _, c in words) / len(words) if words else 0.0
    res.append((conf, cer(r["text"].strip(), hyp), hyp.strip() == r["text"].strip()))
if not res: sys.exit("no rows")
print(f"{len(res)} lines | mean CER {100*sum(c for _, c, _ in res)/len(res):.1f}% | exact match {100*sum(e for *_, e in res)/len(res):.0f}%")
print("confidence bucket -> mean CER (use this to set the BLURRY warning threshold):")
for lo, hi in [(0, 40), (40, 55), (55, 70), (70, 85), (85, 101)]:
    b = [c for conf, c, _ in res if lo <= conf < hi]
    print(f"  {lo:>3}-{min(hi,100):<3} : {len(b):>4} lines | CER {100*sum(b)/len(b):.1f}%" if b else f"  {lo:>3}-{min(hi,100):<3} :    0 lines")
