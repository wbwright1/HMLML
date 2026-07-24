import { segmentEditorialBody } from "@/lib/editorial-emphasis";

interface EditorialBodyProps {
  body: string;
}

/**
 * Renders a Site Desk editorial body with important-detail bolding: stat-shaped
 * tokens (decimals, records, percentages, "No. N", "Nx" multipliers, point
 * totals with an attached unit) get `font-semibold text-text-primary`; the
 * rest inherits whatever classes the parent paragraph puts on this span. Zero
 * client JS; pure server render over segmentEditorialBody.
 */
export function EditorialBody({ body }: EditorialBodyProps) {
  const segments = segmentEditorialBody(body);
  return (
    <>
      {segments.map((segment, i) =>
        segment.emphasis ? (
          <span key={i} className="font-semibold text-text-primary">
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
