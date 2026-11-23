"""Scores outputs with SARI against the 10 human references. Usage: pip install evaluate sacrebleu && python score_asset.py"""
import json, glob, evaluate
sari = evaluate.load("sari")
for path in sorted(glob.glob("asset_out_*.jsonl")):
    rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
    s = sari.compute(sources=[r["original"] for r in rows], predictions=[r["simplification"] for r in rows], references=[r["references"] for r in rows])
    print(f"{path}: SARI {s['sari']:.1f} on {len(rows)} sentences")
