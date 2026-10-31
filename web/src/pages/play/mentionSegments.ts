/** One run of task text: `ref` is true inside a resolved mention. */
export interface TextSegment { text: string; ref: boolean }

/**
 * Splits display `text` into plain and mention runs by `refs` (UTF-16 `[start, end)` ranges into `text`).
 * Ranges are clamped to the text, sorted, and any overlap with an earlier range is dropped; empty runs are
 * omitted. No refs = one plain run.
 *
 * @param text Display text (mentions already resolved to names).
 * @param refs Mention ranges, if any.
 * @returns The runs in order; joined, they equal `text`.
 */
export function segments(text: string, refs?: ReadonlyArray<readonly [number, number]>): TextSegment[] {
  const out: TextSegment[] = [];
  let at = 0;
  const ranges = [...(refs ?? [])].sort((a, b) => a[0] - b[0]);
  for (const [rawStart, rawEnd] of ranges) {
    const start = Math.max(at, Math.min(rawStart, text.length));
    const end = Math.min(rawEnd, text.length);
    if (end <= start) continue;
    if (start > at) out.push({ text: text.slice(at, start), ref: false });
    out.push({ text: text.slice(start, end), ref: true });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at), ref: false });
  return out;
}
