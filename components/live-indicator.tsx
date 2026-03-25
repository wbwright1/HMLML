export function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Live">
      <span
        className="relative flex size-2"
        aria-hidden="true"
      >
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-primary">
        Live
      </span>
    </span>
  );
}
