import { EditorialBody } from "@/components/editorial-emphasis";

interface BurningQuestionsCardProps {
  questions: readonly string[];
}

/**
 * Right-rail "Burning Questions" card: serif italic ordinals paired with each
 * storyline, hairline-separated. The ordinals are decorative editorial markers
 * (serif, not the mono stat treatment used for scores and records).
 */
export function BurningQuestionsCard({ questions }: BurningQuestionsCardProps) {
  if (questions.length === 0) return null;

  return (
    <div className="card-surface divide-y divide-divider p-6">
      {questions.map((question, i) => (
        <div key={i} className="flex gap-4 py-4 first:pt-0 last:pb-0">
          <span
            className="font-serif italic text-h3 leading-none text-accent-gold"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <p className="text-body-sm text-text-secondary">
            <EditorialBody body={question} />
          </p>
        </div>
      ))}
    </div>
  );
}
