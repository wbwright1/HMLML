import { EditorialBody } from "@/components/editorial-emphasis";
import { VisuallyHidden } from "@/components/visually-hidden";
import type { BoldPrediction } from "@/lib/content";

function VerdictChip({ verdict }: { verdict: BoldPrediction["verdict"] }) {
  if (verdict === "LOCK") {
    return <span className="text-caption font-semibold text-accent-green">LOCK</span>;
  }
  if (verdict === "NO") {
    return <span className="text-caption font-semibold text-accent-warm">NO</span>;
  }
  if (verdict === "UP") {
    return (
      <span className="text-body-sm leading-none text-accent-green" aria-hidden="true">
        &#9650;
        <VisuallyHidden>Trending up</VisuallyHidden>
      </span>
    );
  }
  // DOWN
  return (
    <span className="text-body-sm leading-none text-accent-warm" aria-hidden="true">
      &#9660;
      <VisuallyHidden>Trending down</VisuallyHidden>
    </span>
  );
}

/**
 * A "Bold Predictions · Site Desk" card: kicker label top-left, verdict chip
 * top-right, a bold lead sentence, and the site-voice remainder.
 */
export function BoldPredictionCard({ prediction }: { prediction: BoldPrediction }) {
  const kickerTone = prediction.verdict === "DOWN" ? "text-accent-warm" : "text-accent-gold";

  return (
    <div className="card-surface flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className={`text-kicker ${kickerTone}`}>{prediction.kicker}</p>
        <VerdictChip verdict={prediction.verdict} />
      </div>
      <p className="mt-3 text-body text-text-secondary">
        <EditorialBody body={prediction.body} />
      </p>
    </div>
  );
}
