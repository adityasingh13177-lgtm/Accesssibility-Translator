"""Extraction service: PDF text (OCR fallback), image OCR, safe URL reading.
System packages needed: tesseract-ocr (+ language packs: hin ben mar tam tel guj kan pan), poppler-utils."""
import io, ipaddress, os, socket
from urllib.parse import urljoin, urlparse

import httpx, pdfplumber, pytesseract, trafilatura
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pdf2image import convert_from_bytes
from PIL import Image

OCR_LANGS = os.getenv("OCR_LANGS", "eng")
KEY = os.getenv("INTERNAL_KEY", "change-me")
MAX_BYTES, MAX_PAGES, MAX_REDIRECTS = 10 * 1024 * 1024, 40, 4

app = FastAPI(title="AT extractor")

class Fail(Exception):
    def __init__(self, code, message, status=422): self.code, self.message, self.status = code, message, status

@app.exception_handler(Fail)
async def _fail(_: Request, e: Fail):
    return JSONResponse(status_code=e.status, content={"code": e.code, "message": e.message})

def guard(key):
    if key != KEY: raise HTTPException(401, "unauthorised")

def ocr_image(img: Image.Image):
    """Returns (text, mean confidence 0-100)."""
    d = pytesseract.image_to_data(img.convert("RGB"), lang=OCR_LANGS, output_type=pytesseract.Output.DICT)
    words = [(w, float(c)) for w, c in zip(d["text"], d["conf"]) if w.strip() and float(c) >= 0]
    text = pytesseract.image_to_string(img.convert("RGB"), lang=OCR_LANGS)
    conf = sum(c for _, c in words) / len(words) if words else 0.0
    return text, round(conf, 1)

@app.get("/health")
def health(): return {"ok": True}

@app.post("/extract/pdf")
async def extract_pdf(file: UploadFile = File(...), x_internal_key: str = Header(None)):
    guard(x_internal_key)
    data = await file.read()
    if len(data) > MAX_BYTES: raise Fail("TOO_BIG", "That file is larger than 10 MB.", 413)
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = pdf.pages[:MAX_PAGES]
            text = "\n\n".join((p.extract_text() or "") for p in pages)
            n = len(pdf.pages)
    except Exception:
        raise Fail("BAD_PDF", "We couldn\u2019t open that PDF. It may be damaged or password-protected.")
    if len(text.strip()) >= 30 * max(1, min(n, MAX_PAGES)):   # real text layer found
        return {"text": text, "pages": n, "method": "text"}
    # Scanned PDF: render pages and OCR them
    texts, confs = [], []
    for im in convert_from_bytes(data, dpi=200, first_page=1, last_page=min(n, 15)):
        t, c = ocr_image(im); texts.append(t); confs.append(c)
    return {"text": "\n\n".join(texts), "pages": n, "method": "ocr", "confidence": round(sum(confs) / len(confs), 1) if confs else 0}

@app.post("/extract/image")
async def extract_image(file: UploadFile = File(...), x_internal_key: str = Header(None)):
    guard(x_internal_key)
    data = await file.read()
    if len(data) > MAX_BYTES: raise Fail("TOO_BIG", "That file is larger than 10 MB.", 413)
    try:
        img = Image.open(io.BytesIO(data)); img.load()
    except Exception:
        raise Fail("BAD_IMAGE", "We couldn\u2019t open that image.")
    if max(img.size) > 4000: img.thumbnail((4000, 4000))
    text, conf = ocr_image(img)
    return {"text": text, "method": "ocr", "confidence": conf}

# ---------- SSRF-safe URL fetching ----------
def check_host(host: str):
    try: infos = socket.getaddrinfo(host, None)
    except socket.gaierror: raise Fail("BAD_URL", "We couldn\u2019t reach that web address.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise Fail("BLOCKED_URL", "For safety, we can\u2019t open that web address.")

def safe_fetch(url: str) -> str:
    for _ in range(MAX_REDIRECTS + 1):
        u = urlparse(url)
        if u.scheme not in ("http", "https") or not u.hostname: raise Fail("BAD_URL", "Please enter a full web address starting with https://")
        check_host(u.hostname)                      # re-checked on every redirect hop
        try:
            with httpx.stream("GET", url, timeout=15, follow_redirects=False, headers={"User-Agent": "AccessibilityTranslator/1.0"}) as r:
                if r.status_code in (301, 302, 303, 307, 308):
                    url = urljoin(url, r.headers.get("location", "")); continue
                if r.status_code >= 400: raise Fail("FETCH_FAILED", "That page didn\u2019t open. Please check the address.")
                if not any(t in r.headers.get("content-type", "") for t in ("text/html", "application/xhtml")):
                    raise Fail("NOT_HTML", "That link isn\u2019t a web page we can read. Try uploading it as a PDF.")
                buf = b""
                for chunk in r.iter_bytes():
                    buf += chunk
                    if len(buf) > 5 * 1024 * 1024: raise Fail("TOO_BIG", "That page is too large to read.")
                return buf.decode(r.encoding or "utf-8", errors="replace")
        except httpx.HTTPError:
            raise Fail("FETCH_FAILED", "We couldn\u2019t reach that web address.")
    raise Fail("FETCH_FAILED", "That address redirects too many times.")

@app.post("/extract/url")
async def extract_url(req: Request, x_internal_key: str = Header(None)):
    guard(x_internal_key)
    url = (await req.json()).get("url", "")
    html = safe_fetch(url)
    text = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
    meta = trafilatura.extract_metadata(html)
    return {"text": text, "title": (meta.title if meta and meta.title else None), "method": "html"}
