// Offline readability metrics (no libraries needed).
const syl = (w) => { const m = w.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); };
export function fkgl(text) {
  const words = text.match(/[A-Za-z']+/g) || [], sents = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
  if (!words.length) return 0;
  return 0.39 * (words.length / sents) + 11.8 * (words.reduce((a, w) => a + syl(w), 0) / words.length) - 15.59;
}
export const lengthRatio = (orig, out) => out.split(/\s+/).filter(Boolean).length / Math.max(1, orig.split(/\s+/).filter(Boolean).length);
// Share of the original's numbers that survive in the simplified text.
export function numbersKept(orig, out) {
  const nums = (orig.match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[.,]+$/, "").replace(/,/g, ""));
  if (!nums.length) return null;
  const o = out.replace(/,/g, "");
  return nums.filter((n) => o.includes(n)).length / nums.length;
}
