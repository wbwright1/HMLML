import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import type { HubPowerPreview, PowerPreviewMover } from "@/lib/queries/power-preview";

/** Trend vs. season standings: sage ▲ for climbers, rust ▼ for sliders. Never
 * color alone; the glyph + value always ride together. Mirrors the FormIndicator
 * on app/records/power-rankings/page.tsx (kept local; that copy is coupled to
 * that page's markup, this one to the hub's compact row). */
function FormIndicator({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-text-tertiary">
        <span aria-hidden>&ndash;</span>
        <span>0</span>
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-accent-green">
        <span aria-hidden>&#9650;</span>
        <span>{delta}</span>
        <span className="sr-only">spots ahead of standings</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-accent-warm">
      <span aria-hidden>&#9660;</span>
      <span>{Math.abs(delta)}</span>
      <span className="sr-only">spots behind standings</span>
    </span>
  );
}

function MoverRow({
  mover,
  direction,
}: {
  mover: PowerPreviewMover;
  direction: "riser" | "faller";
}) {
  const tone = direction === "riser" ? "text-accent-green" : "text-accent-warm";
  const glyph = direction === "riser" ? "▲" : "▼";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <FranchiseLogo
        slug={mover.slug}
        name={mover.name}
        abbreviation={mover.abbreviation}
        brandingColor={mover.brandingColor}
        avatarUrl={mover.avatarUrl}
        size={20}
        decorative
      />
      <div className="min-w-0 flex-1">
        <p className="text-caption text-text-tertiary">
          {direction === "riser" ? "Riser" : "Faller"}
        </p>
        <TeamLink
          slug={mover.slug}
          className="block text-body-sm text-text-primary truncate"
        >
          {mover.name}
        </TeamLink>
      </div>
      <span className={`flex items-center gap-1 font-mono text-xs font-bold tabular-nums shrink-0 ${tone}`}>
        <span aria-hidden>{glyph}</span>
        <span>{mover.delta}</span>
      </span>
    </div>
  );
}

/**
 * Power Rankings preview for the in-season hub (#277): top-N rows plus a
 * riser/faller strip, linking through to the full rankings page. Server
 * component, no fetching of its own (callers fetch via getHubPowerPreview).
 */
export function PowerPulseCard({
  preview,
  week,
}: {
  preview: HubPowerPreview;
  week: number;
}) {
  const kicker =
    preview.mode === "preseason" ? "Preseason Power" : `Power Rankings · Week ${week}`;

  return (
    <section className="space-y-3">
      <p className="text-kicker">{kicker}</p>
      <div className="card-surface relative overflow-hidden p-5">
        <div className="divide-y divide-divider">
          {preview.top.map((row) => {
            const rankColor = row.rank <= 3 ? "text-accent-gold" : "text-text-tertiary";
            return (
              <TeamLink
                key={row.id}
                slug={row.slug}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
              >
                <span className={`font-mono text-sm font-black tabular-nums w-5 text-center shrink-0 ${rankColor}`}>
                  {row.rank}
                </span>
                <FranchiseLogo
                  slug={row.slug}
                  name={row.name}
                  abbreviation={row.abbreviation}
                  brandingColor={row.brandingColor}
                  avatarUrl={row.avatarUrl}
                  size={28}
                  decorative
                />
                <span className="min-w-0 flex-1 text-body-sm text-text-primary truncate">
                  {row.name}
                </span>
                {preview.mode === "regular" ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs tabular-nums text-text-tertiary whitespace-nowrap">
                      {row.record}
                    </span>
                    {row.formDelta !== null && <FormIndicator delta={row.formDelta} />}
                  </div>
                ) : (
                  <span className="font-mono text-sm font-bold tabular-nums text-accent-gold shrink-0">
                    {row.powerIndex}
                  </span>
                )}
              </TeamLink>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-divider">
          {preview.mode === "regular" ? (
            preview.riser || preview.faller ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {preview.riser && <MoverRow mover={preview.riser} direction="riser" />}
                {preview.faller && <MoverRow mover={preview.faller} direction="faller" />}
              </div>
            ) : null
          ) : (
            <p className="text-body-sm text-text-secondary">
              Nobody has played a game yet. This is the preseason edition:
              history plus projected roster strength. Real rankings land after
              Week 1.
            </p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-divider">
          <Link
            href="/records/power-rankings"
            className="text-caption text-accent-gold hover:brightness-110 normal-case tracking-normal"
          >
            Full power rankings &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
