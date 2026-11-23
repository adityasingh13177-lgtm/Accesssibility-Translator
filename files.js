import { AppError } from "../errors.js";
// Check the real file signature, not just the name or the browser-supplied type.
export function sniff(buf) {
  if (buf.slice(0, 5).toString() === "%PDF-") return "pdf";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "webp";
  return null;
}
export function checkUpload(file, source) {
  if (!file) throw new AppError("NO_FILE", "Please choose a file first.");
  const kind = sniff(file.buffer);
  const ok = source === "pdf" ? kind === "pdf" : source === "img" ? ["png", "jpeg", "webp"].includes(kind) : false;
  if (!ok) throw new AppError("BAD_TYPE", source === "pdf" ? "That doesn\u2019t look like a PDF. Please choose a PDF file." : "Please choose a PNG, JPG or WebP image.", 415);
  return kind;
}
