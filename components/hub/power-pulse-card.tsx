import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import { HubSection, LinkRows, HUB_ROW_LINK } from "@/components/hub/rail-card";
import { buttonVariants } from "@/components/ui/button-variants";
import { HUB_LABELS } from "@/lib/content";
import type { HubPowerPreview, PowerPreviewMover } from "@/lib/queries/power-preview";

/** Spots moved since last week: sage ▲ for climbers, rust ▼ for sliders. Never
 * color alone; the glyph + value always ride together. Mirrors the FormIndicator
 * on app/records/power-rankings/page.tsx (kept local; that copy is coupled to
 * that page's markup, this one to the hub's compact row). */
function FormIndicator({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="flex items-center gap-1 text-caption text-text-tertiary">
        <span aria-hidden>&plusmn;</span>
        <span className="font-mono tabular-nums">0</span>
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 text-caption font-bold text-accent-green">
        <span aria-hidden>&#9650;</span>
        <span className="font-mono tabular-nums">{delta}</span>
        <span className="sr-only">up from last week</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-caption font-bold text-accent-warm">
      <span aria-hidden>&#9660;</span>
      <span className="font-mono tabular-nums">{Math.abs(delta)}</span>
      <span className="sr-only">down from last week</span>
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
          className="flex min-h-11 items-center text-body-sm text-text-primary truncate"
        >
          {mover.name}
        </TeamLink>
      </div>
      <span className={`flex items-center gap-1 text-caption font-bold shrink-0 ${tone}`}>
        <span aria-hidden>{glyph}</span>
        <span className="font-mono tabular-nums">{mover.delta}</span>
      </span>
    </div>
  );
}

/**
 * Power Rankings preview for the in-season hub (#277): top-N rows plus a
 * riser/faller strip, linking through to the full rankings page. Server
 * component, no fetching of its own (callers fetch via getHubPowerPreview).
 */
export function PowerPulseCard({ preview }: { preview: HubPowerPreview }) {
  // One label per module: the live pill already names the week.
  const kicker =
    preview.mode === "preseason" ? HUB_LABELS.preseasonPower : HUB_LABELS.powerRankings;

  return (
    <HubSection kicker={kicker}>
      <LinkRows>
        {preview.top.map((row) => {
          // Only #1 is gold (Blake's call): the leader row reads as the
          // leader, the rest stay quiet.
          const rankColor = row.rank === 1 ? "text-accent-gold" : "text-text-secondary";
          return (
            <TeamLink key={row.id} slug={row.slug} className={HUB_ROW_LINK}>
              <span
                className={`font-mono text-body-sm font-black tabular-nums w-5 text-center shrink-0 ${rankColor}`}
              >
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
                <span className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-caption tabular-nums text-text-secondary whitespace-nowrap">
                    {row.record}
                  </span>
                  {row.rankChange !== null && <FormIndicator delta={row.rankChange} />}
                </span>
              ) : (
                <span className="font-mono text-body-sm font-bold tabular-nums text-accent-gold shrink-0">
                  {row.powerIndex}
                </span>
              )}
            </TeamLink>
          );
        })}
      </LinkRows>

      {preview.mode === "regular" ? (
        preview.riser || preview.faller ? (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
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

      <Link
        href="/records/power-rankings"
        className={`${buttonVariants({ variant: "quiet", size: "default" })} -ml-5`}
      >
        Full power rankings
        <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
      </Link>
    </HubSection>
  );
}
