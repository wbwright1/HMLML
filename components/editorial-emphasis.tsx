import { segmentEditorialBody } from "@/lib/editorial-emphasis";

interface EditorialBodyProps {
  body: string;
}

/**
 * Splits an emphasized token into numeric runs and surrounding words so the
 * numerals render in JetBrains Mono per the three-font rule ("EVERY numeral")
 * while attached words ("No. ", "points", the "x" in "3x") stay in Geist.
 * Matches the record/decimal/percent shapes the tokenizer emits.
 */
function emphasizedParts(text: string): (string | { numeral: string })[] {
  return text
    .split(/(\d[\d,.]*(?:-\d[\d,.]*)*%?)/g)
    .filter((part) => part !== "")
    .map((part) => (/^\d/.test(part) ? { numeral: part } : part));
}

/**
 * Renders a Site Desk editorial body with important-detail bolding: stat-shaped
 * tokens (decimals, records, percentages, "No. N", "Nx" multipliers, point
 * totals with an attached unit) get `font-semibold text-text-primary`, with
 * their numerals in mono tabular figures; the rest inherits whatever classes
 * the parent paragraph puts on this span. Zero client JS; pure server render
 * over segmentEditorialBody.
 */
export function EditorialBody({ body }: EditorialBodyProps) {
  const segments = segmentEditorialBody(body);
  return (
    <>
      {segments.map((segment, i) =>
        segment.emphasis ? (
          <span key={i} className="font-semibold text-text-primary">
            {emphasizedParts(segment.text).map((part, j) =>
              typeof part === "string" ? (
                part
              ) : (
                <span key={j} className="font-mono tabular-nums">
                  {part.numeral}
                </span>
              ),
            )}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
