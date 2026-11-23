"""OCR word recall on FUNSD form images, using the same OCR call as the extractor. Usage: python ocr_funsd.py [N=30]
Needs: tesseract installed, pip install pytesseract pillow. Reads data/funsd.jsonl from `python prepare.py funsd`."""
import json, os, re, sys
import pytesseract
from PIL import Image
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"); N = int(sys.argv[1]) if len(sys.argv) > 1 else 30
tok = lambda s: set(w for w in re.findall(r"[a-z0-9]+", s.lower()) if len(w) > 1)
tot = hit = 0
for line in list(open(os.path.join(D, "funsd.jsonl"), encoding="utf-8"))[:N]:
    r = json.loads(line)
    if not os.path.exists(r["image"]): print("image not found:", r["image"]); continue
    got = tok(pytesseract.image_to_string(Image.open(r["image"]).convert("RGB"), lang="eng")); want = tok(" ".join(r["words"]))
    tot += len(want); hit += len(want & got)
print(f"OCR word recall on FUNSD: {100*hit/max(1,tot):.1f}% ({hit}/{tot} distinct words)")
