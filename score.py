"""Scores outputs written by run.js. Usage: pip install sacrebleu && python score.py
translate -> chrF++ per language;  summarise -> ROUGE-1/ROUGE-L F1 (simple whitespace tokens: rough for Indic scripts)."""
import json, os, collections
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
def rows(n):
    p = os.path.join(D, n); return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()] if os.path.exists(p) else []
def lcs(a, b):
    dp = [0] * (len(b) + 1)
    for x in a:
        prev = 0
        for j, y in enumerate(b, 1):
            cur = dp[j]; dp[j] = prev + 1 if x == y else max(dp[j], dp[j - 1]); prev = cur
    return dp[-1]
def f1(p, r, hit): return 0.0 if not hit or not p or not r else 2 * (hit / len(p)) * (hit / len(r)) / ((hit / len(p)) + (hit / len(r)))
tr = rows("out_translate.jsonl")
if tr:
    from sacrebleu.metrics import CHRF
    by = collections.defaultdict(list)
    for r in tr: by[r["tgt"]].append(r)
    for k, v in sorted(by.items()):
        print(f"chrF++ {k}: {CHRF(word_order=2).corpus_score([x['hyp'] for x in v], [[x['ref'] for x in v]]).score:.1f} ({len(v)} sentences)")
sm = rows("out_summarise.jsonl")
if sm:
    r1, rl = [], []
    for r in sm:
        h, s = r["hyp"].split(), r["summary"].split(); c = collections.Counter(h) & collections.Counter(s)
        r1.append(f1(h, s, sum(c.values()))); rl.append(f1(h, s, lcs(h, s)))
    print(f"ROUGE-1 {100*sum(r1)/len(r1):.1f} | ROUGE-L {100*sum(rl)/len(rl):.1f} on {len(sm)} items (our output is an explanation, not a headline, so expect lower scores than summarisers)")
