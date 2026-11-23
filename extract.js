import { cfg } from "../config.js";
import { AppError } from "../errors.js";

const H = { "X-Internal-Key": cfg.internalKey };
async function call(path, init) {
  let r;
  try { r = await fetch(cfg.extractorUrl + path, { ...init, headers: { ...H, ...(init.headers || {}) }, signal: AbortSignal.timeout(90000) }); }
  catch { throw new AppError("EXTRACTOR_DOWN", "Our reader is busy right now. Please try again in a moment.", 503); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError(j.code || "EXTRACT_FAILED", j.message || "We couldn\u2019t read that document.", r.status === 422 ? 422 : 502);
  return j; // { text, title?, pages?, method, confidence? }
}

export async function extractFile(file, kind) {
  const fd = new FormData();
  fd.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "upload");
  return call(kind === "pdf" ? "/extract/pdf" : "/extract/image", { method: "POST", body: fd });
}
export const extractUrl = (url) =>
  call("/extract/url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });

export const cleanText = (t) => String(t || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
