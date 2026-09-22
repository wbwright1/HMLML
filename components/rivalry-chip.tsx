/**
 * Compact gold chip naming a commissioner-named rivalry on a schedule row.
 * Truncates long names; the full name rides on `title`. Callers whose row sits
 * inside an aria-labelled link also put the name in that label, since a link's
 * aria-label replaces its content for assistive tech.
 */
export function RivalryChip({ name }: { name: string }) {
  return (
    <span
      data-testid="rivalry-chip"
      title={name}
      className="inline-flex max-w-[12rem] min-w-0 items-center rounded-full bg-accent-gold-light px-2 py-0.5 text-caption font-semibold text-accent-gold"
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
