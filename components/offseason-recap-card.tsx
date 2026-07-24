import Link from "next/link";

interface RecapItem {
  label: string;
  value: string;
  href?: string;
}

interface OffseasonRecapCardProps {
  seasonYear: number;
  items: RecapItem[];
}

export function OffseasonRecapCard({
  seasonYear,
  items,
}: OffseasonRecapCardProps) {
  return (
    <div className="card-surface p-6 space-y-4">
      <p className="text-kicker">
        {seasonYear} Season Recap
      </p>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="text-body-sm text-text-tertiary">
              {item.label}
            </span>
            {item.href ? (
              <Link
                href={item.href}
                className="text-body-sm font-bold hover:text-accent-green transition-colors text-right"
              >
                {item.value}
              </Link>
            ) : (
              <span className="text-body-sm font-bold text-right">
                {item.value}
              </span>
            )}
          </div>
        ))}
      </div>

      <Link
        href={`/seasons/${seasonYear}`}
        className="text-sm text-accent-green hover:underline"
      >
        Full Season Details
      </Link>
    </div>
  );
}
