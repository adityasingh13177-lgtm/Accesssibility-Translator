"""Downloads the ASSET TEST split (359 sentences, 10 human simplifications each) and writes a small sample.
ASSET is an EVALUATION set (it has no training split). Do not copy its sentences into the product or its prompts.
Usage: pip install datasets && python prepare_asset.py [N=100]"""
import json, random, sys
from datasets import load_dataset

n = int(sys.argv[1]) if len(sys.argv) > 1 else 100
ds = load_dataset("facebook/asset", "simplification", split="test")
idx = list(range(len(ds))); random.Random(7).shuffle(idx)
with open("asset_test.jsonl", "w", encoding="utf-8") as f:
    for i in idx[:n]:
        f.write(json.dumps({"original": ds[i]["original"], "references": ds[i]["simplifications"]}, ensure_ascii=False) + "\n")
print(f"wrote {min(n, len(ds))} sentences to asset_test.jsonl")
