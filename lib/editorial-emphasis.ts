// ---------------------------------------------------------------------------
// Editorial body emphasis
// ---------------------------------------------------------------------------
// Splits a Site Desk editorial body into segments, flagging the stat-shaped
// tokens worth bolding so the renderer can weight them. Replaces the old
// "bold the first sentence" treatment (splitLead in bold-prediction-card.tsx):
// that broke on abbreviations like "No. 9" (the [.!?] sentence-break regex
// split mid-token) and bolded whatever happened to come first rather than
// what's actually notable.
//
// Token patterns are aligned with lib/content-gen/claims.ts extractStatTokens
// (decimals, thousands-comma numbers, percentages, W-L(-T) records) plus two
// cases claims.ts deliberately excludes there (because they aren't citable
// numeric facts, just framing): "No. N" phrases and "Nx" multipliers. Bare
// integers and 4-digit years are never emphasized here, unlike claims.ts,
// which only cares whether a number is verifiable, not whether it reads well
// bolded; a bare "12" or "2026" mid-sentence is noise, not a stat callout.

export interface EditorialSegment {
  text: string;
  emphasis: boolean;
}

/** Unit words that, directly following a number, make the whole phrase a stat callout. */
const UNIT_WORDS = "points|PF|PA|picks|seasons|wins|losses";

/**
 * Ordered alternation: earlier patterns win when multiple could start
 * matching at the same position (e.g. a record vs. a percentage both start
 * with a digit). Each token type appears once, most specific first.
 */
const TOKEN_RE = new RegExp(
  [
    // "No. N" phrases: kept together as one token, never split mid-abbreviation.
    String.raw`\bNo\.?\s*\d+\b`,
    // W-L(-T) records, e.g. "12-4" or "9-6-1".
    String.raw`\b\d{1,3}-\d{1,3}(?:-\d{1,3})?\b`,
    // Percentages.
    String.raw`\b\d+(?:\.\d+)?%`,
    // "Nx" multipliers, e.g. "3x".
    String.raw`\b\d+(?:\.\d+)?x\b`,
    // Thousands-comma numbers, with an optional directly-adjacent unit word.
    String.raw`\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s(?:${UNIT_WORDS}))?\b`,
    // Plain decimals, with an optional directly-adjacent unit word.
    String.raw`\b\d+\.\d+(?:\s(?:${UNIT_WORDS}))?\b`,
    // Leading-dot decimals, e.g. ".414".
    String.raw`(?<![\d.])\.\d{2,3}\b`,
  ].join("|"),
  "gi",
);

/**
 * Splits an editorial body into alternating plain/emphasized segments.
 * Concatenating every segment's `text` reconstructs `body` exactly. A body
 * with no stat-shaped tokens returns a single non-emphasized segment. Pure;
 * unit-tested directly.
 */
export function segmentEditorialBody(body: string): EditorialSegment[] {
  if (!body) return [{ text: body, emphasis: false }];

  const segments: EditorialSegment[] = [];
  let lastIndex = 0;
  TOKEN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(body)) !== null) {
    const [token] = match;
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: body.slice(lastIndex, start), emphasis: false });
    }
    segments.push({ text: token, emphasis: true });
    lastIndex = start + token.length;
    // Guard against zero-length matches looping forever (shouldn't happen
    // with these patterns, but cheap insurance).
    if (token.length === 0) TOKEN_RE.lastIndex++;
  }
  if (lastIndex < body.length) {
    segments.push({ text: body.slice(lastIndex), emphasis: false });
  }

  return segments.length > 0 ? segments : [{ text: body, emphasis: false }];
}
