# Benchmark datasets: what each one is for, and what the dataset pages actually say

None of these is used to train a model here. They are test sets. Licence and size are copied from each dataset's page (checked
in this session) except SQuAD v2, which was not re-checked. "NC" means non-commercial: check before ANY commercial use,
including by a company that only evaluates with it. Never copy their text into the product, the prompts or a shipped file.

| # | Dataset | Tests in our app | Size (page) | Licence (page) | Things found on the page |
|---|---------|------------------|-------------|----------------|--------------------------|
| 1 | waboucay/wikilarge | sentence simplification (second opinion) | 143 MB | none stated | Uploader is not the creator; loading script; the example target is very short and loses facts (noisy). Single reference. |
| 2 | iastate/onestop_english | do our 3 levels match real Elementary / Intermediate / Advanced text | 567 texts | CC BY-SA 4.0 | One `train` split; label 0/1/2 = ele/int/adv; texts are NOT paired by article id in the HF version. |
| 3a | ai4bharat/IN22-Gen | English -> 22 Indic languages, includes legal, government, health domains | 1,024 sentences | CC BY 4.0 | GATED: log in and accept terms. Config `eng_Latn-hin_Deva`, split `gen`. |
| 3b | Muennighoff/flores200 | English -> 200 languages | dev 997 / devtest 1,012 | CC BY-SA 4.0 | Loading script, so needs `datasets<4`. Wikinews/Wikijunior/Wikivoyage text, not notices. |
| 4 | ai4bharat/samanantar | extra translation sample | 49.7M pairs, 7.2 GB | CC BY-NC 4.0 | Mined, not human-checked: the viewer shows MANY mismatched pairs and lots of religious-publication text. Hand-check 100 pairs before trusting any score. No Kannada gap but no test split. |
| 5 | csebuetnlp/xlsum | does our explanation capture a news article's point | 1.35M pairs, 45 languages | CC BY-NC-SA 4.0 | BBC articles, copyright stays with the original holders. Has hi/bn/mr/ta/te/gu/pa, NO Kannada. Loading script. |
| 6 | ai4bharat/IndicSentenceSummarization | sentence -> headline in 11 languages | 1.11M rows over 11 languages | CC BY-NC 4.0 | It is HEADLINE generation, not document summaries; several targets in the viewer do not match their input (noisy). |
| 7 | rajpurkar/squad_v2 | "answer only from the document": answerable vs unanswerable questions | ~130k train / ~12k validation | CC BY-SA 4.0 (not re-checked) | Best fit for our Q&A rule. English only. |
| 8 | ai4bharat/IndicQA | the same rule in Indic languages | 25 MB | CC BY 4.0 | Loading script. Card does not say whether unanswerable questions exist: check after download. Card lists 10 languages. |
| 9 | florianbussmann/FUNSD-vu2020revising | OCR on noisy English form scans, header/question/answer tags | 149 train + 50 test forms | NOT STATED | Loading script; repo is 11.6 kB so images come from elsewhere; English only. Licence unknown: treat as research-only. |

(ASSET, added earlier: CC BY-NC 4.0 in the text but CC BY-SA in the header; evaluation only.)

## How to run
    pip install "datasets<4" sacrebleu pytesseract pillow
    cd eval/datasets
    python prepare.py squad 100                 # Q&A, answerable + unanswerable
    python prepare.py onestop 150               # reading levels
    python prepare.py flores 160 && python prepare.py in22 160   # translation (in22 needs a Hugging Face login first)
    python prepare.py xlsum 50 hi               # summaries (hi, bn, mr, ta, te, gu, pa)
    cd ../../server
    npm run ds -- qa 100        npm run ds -- readlevel     npm run ds -- translate 160     npm run ds -- summarise 50
    cd ../eval/datasets && python score.py      # chrF++ and ROUGE;  python ocr_funsd.py after `python prepare.py funsd`

## What these sets can NOT tell you
- None contains Indian notices, bills, forms or circulars: your own `eval/test_set.csv` is the real test.
- None checks facts, deadlines or "not found" in a document (SQuAD v2 comes closest).
- Nothing here has Indic scanned documents or phone photos, which is where OCR will really fail.

# Added: image / OCR and later sources

## Checked in this session
| Dataset | Tests | What the page / paper says | Things to know |
|---|---|---|---|
| priyank-m/SROIE_2019_text_recognition | line-level OCR accuracy (English) | 33,626 train + 18,704 test CROPPED LINE images made from 973 scanned receipts; text in metadata.jsonl; 183 MB; raw source is the SROIE set on Kaggle | Receipts (Malaysian), English only, single lines: it tests recognition, NOT page layout, Indic scripts or notices. The page states no licence. |
| arXiv 2205.02543: "OCR Synthetic Benchmark Dataset for Indic Languages" (EkStep / Tarento) | line-level OCR in Indian languages | ~90k images, 23 languages, ~2,500 line images per language; mostly SYNTHETIC (clean, scanned-style, poor-quality classes), plus a small real part and scene text in 8 languages; seed text from legal texts, government orders, NCERT books, Supreme Court vernacular judgments | The paper itself warns synthetic test data may not match real use. The excerpt I read does not say where to download the images or the licence: find the link in the paper before use. |

Run (needs tesseract with the language packs you test):
    python prepare_ocr.py sroie 300                 # then:
    python ocr_lines.py data/ocr/sroie.jsonl 300
    python prepare_ocr.py folder <downloaded-folder> hin   # folder needs images + labels.jsonl {"image","text"}
`ocr_lines.py` prints mean CER per Tesseract-confidence bucket: use it to choose the "blurry scan" warning threshold from evidence
(my screenshot test scored 61.6% on a sharp image, close to the current 55% threshold).

## NOT checked in this session (I could not read these pages within limits; treat everything below as unverified)
| Source you gave | What you want it for | What I can and cannot say |
|---|---|---|
| hf-internal-testing/fixtures_docvqa | page-level reading | Name suggests a tiny fixture set for library tests, not a benchmark. Unverified. |
| AIKosh "coild_governance" | real notices, bills, forms | Not read. This is the most valuable item for you: check its licence, languages, and whether it has the facts/deadlines/steps labels your test set needs. |
| L3Cube-IndicSQuAD (GitHub) | listed under Indic OCR | From memory it is a question-answering set, not OCR, but I did not verify it. |
| IndicSTR12 paper (IIIT) | Indic OCR | Title says scene TEXT recognition (photos of signs and shop boards), which is not scanned documents. Not read. |
| mohitskaushal/InLegalLaySum-Phi4-Train-16K | plain-language legal text | Name suggests model-generated (Phi-4) lay summaries: check whether humans verified them before trusting them as references. Not read. |
| ai4bharat/indicmt-eval | native-speaker ratings | Not read: check which languages, who rated, and the licence. |
| arXiv 2407.13522v2 and 2505.03688 | Indic questions with unanswerable cases | I did not read either paper and will not guess their content. |

# Your ten language zips (Indic SQuAD v2 style question sets)

These are NOT OCR images. Each zip has train / validation / test JSON with SQuAD v2 fields (id, title, context, question, answers),
and empty `answers` mean "not answerable": exactly what the "answer only from the document" rule needs, in Indian languages.
Measured on the files (validation split, 11,873 questions per language; test split 11,803, 67% answerable):

| Language | validation: answerable | answer text found inside its context |
|---|---|---|
| Hindi, Bengali, Gujarati, Kannada, Malayalam, Punjabi, Tamil, Telugu | 50% | 100% |
| Oriya | 50% | 99% |
| Marathi | 50% (files wrapped as {"data": [...]}, plus a 500-question `test_gold.json`) | 100% |

Why it helps: it is the closest test you have for refusing to guess. What it cannot tell you:
- Topics are translated Wikipedia articles, not notices, bills or forms.
- The translations look machine-made and their quality is unchecked: have a native speaker rate ~50 per language before trusting a score.
- I do not know who made these files or their licence. The ids match SQuAD v2 (CC BY-SA 4.0, English). If they came from the
  L3Cube-IndicSQuAD link you sent earlier, I did not verify that licence. Do not ship them or put their text in prompts.
- Each language zip is ~330 MB, mostly the train split. The product does not need train: keep only validation or test for testing.

    python prepare_indicsquad.py <folder-with-zips> 60 validation
    cd ../../server && npm run ds -- qa 60 indicsquad_hi.jsonl     # repeat per language code: hi bn gu kn ml mr or pa ta te

Note: `eval/files/` does not include your resume (it has personal contact details). Copy it there yourself to enable test row D004; without it the row is skipped.
