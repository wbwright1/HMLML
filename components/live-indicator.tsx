export function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="Live">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75 motion-safe:animate-[live-pulse_1.6s_ease-out_infinite]" />
        <span className="relative inline-flex size-2 rounded-full bg-accent-green" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-accent-green">
        Live
      </span>
    </span>
  );
}
