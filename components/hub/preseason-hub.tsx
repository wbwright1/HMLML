import { KickoffCountdown } from "@/components/kickoff-countdown";
import { DraftCountdown } from "@/components/draft-countdown";
import { SmackFeed } from "@/components/smack-feed";
import { EmptyState } from "@/components/empty-state";
import { DivisionFieldCard } from "@/components/hub/division-field-card";
import { BoldPredictionCard } from "@/components/hub/bold-prediction-card";
import {
  OffseasonReceiptCard,
  type ReceiptFranchise,
} from "@/components/hub/offseason-receipt-card";
import { BurningQuestionsCard } from "@/components/hub/burning-questions-card";
import { getHubEditorial } from "@/lib/content";
import { getPreseasonField } from "@/lib/queries/preseason-field";
import { getNextKickoff } from "@/lib/queries/kickoff";
import { getLastCompletedSeason } from "@/lib/queries/seasons";
import { daysUntil } from "@/lib/hub/live-pill-label";
import type { getLatestSeason } from "@/lib/queries/matchups";

// Small uppercase eyebrow above each hub module (matches the mock's kicker
// labels; distinct from PageSection's large serif titles).
function ModuleLabel({ children, meta }: { children: React.ReactNode; meta?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <p className="text-kicker">{children}</p>
      {meta && <span className="text-caption text-text-tertiary">{meta}</span>}
    </div>
  );
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function PreseasonHub({
  latestSeason,
}: {
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
}) {
  const editorial = getHubEditorial();
  const seasonYear = latestSeason?.seasonYear ?? new Date().getFullYear();

  // Field grouping + last-season records/tags, plus the Week 1 kickoff target.
  let field: Awaited<ReturnType<typeof getPreseasonField>> = {
    divisions: [],
    hasDivisions: false,
  };
  let kickoffTarget: Date | null = null;
  try {
    const completedSeason = await getLastCompletedSeason();
    [field, kickoffTarget] = await Promise.all([
      getPreseasonField(latestSeason?.id, completedSeason?.id),
      latestSeason ? getNextKickoff(seasonYear, 1) : Promise.resolve(null),
    ]);
  } catch {
    // DB may be unavailable in dev; fall through to the empty state below.
  }

  // Countdown precedence: the rookie draft until it passes, then Week 1 kickoff.
  const draftDate = process.env.NEXT_PUBLIC_DRAFT_DATE;
  const draftUpcoming = draftDate ? new Date(draftDate).getTime() > Date.now() : false;

  // Days-to-kickoff powers the hero dek. Floor-based (shared daysUntil) so it
  // matches the countdown DAYS card and the topbar pill. Static server-rendered
  // prose; the countdown cards themselves tick client-side.
  const daysToKickoff = kickoffTarget ? daysUntil(kickoffTarget, new Date()) : null;
  const dek =
    daysToKickoff != null
      ? `Draft's in the books, rosters are locked, and every single one of you is undefeated for ${daysToKickoff} more days. Screenshot the 0-0 while you've got it.`
      : "Draft's in the books, rosters are locked, and every single one of you is undefeated. Screenshot the 0-0 while you've got it.";

  // Resolve a crest for each offseason receipt. Placeholder editorial slugs may
  // not map to a real franchise; fall back to a slug-derived name so the crest
  // shows initials instead of breaking.
  const franchiseBySlug = new Map<string, ReceiptFranchise>();
  for (const division of field.divisions) {
    for (const team of division.teams) {
      franchiseBySlug.set(team.slug, {
        slug: team.slug,
        name: team.name,
        abbreviation: team.abbreviation,
        brandingColor: team.brandingColor,
      });
    }
  }
  const resolveReceiptFranchise = (slug: string): ReceiptFranchise =>
    franchiseBySlug.get(slug) ?? {
      slug,
      name: titleCaseSlug(slug),
      abbreviation: null,
      brandingColor: null,
    };

  const smackPosts = editorial.smackPosts.slice(0, 3);
  const hasField = field.divisions.length > 0;

  // Nothing to show (empty DB): keep a calm, on-voice fallback.
  if (!hasField && !draftUpcoming && !kickoffTarget) {
    return (
      <EmptyState
        icon="calendar"
        title="Preseason Mode"
        description="The league is gearing up for a new season. The field and countdown will appear once rosters and the schedule are synced."
      />
    );
  }

  return (
    <>
      {/* Countdown hero */}
      <section className="grid grid-cols-1 gap-6 pt-2 pb-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <p className="text-kicker">
            {`Harambe Memorial League · ${seasonYear} · Title Defense Loading`}
          </p>
          <h1 className="text-display mt-3">
            The season&rsquo;s on the clock<span className="text-accent-gold">.</span>
          </h1>
          <p className="text-body-lg text-text-secondary mt-4 max-w-xl">{dek}</p>
        </div>
        <div className="lg:justify-self-end">
          {draftUpcoming && draftDate ? (
            <DraftCountdown draftDate={draftDate} />
          ) : kickoffTarget ? (
            <KickoffCountdown target={kickoffTarget.toISOString()} />
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 pb-4 lg:grid-cols-[1fr_340px] lg:gap-12">
        {/* Left column */}
        <div className="min-w-0 space-y-12">
          {/* The Field */}
          {hasField && (
            <section>
              <ModuleLabel>
                {field.hasDivisions ? "The Field · Grouped by Division" : "The Field"}
              </ModuleLabel>
              <div
                className={
                  field.hasDivisions
                    ? "grid grid-cols-1 gap-4 lg:grid-cols-3"
                    : "grid grid-cols-1 gap-4"
                }
              >
                {field.divisions.map((division, i) => {
                  const ed =
                    editorial.divisions[division.divisionName] ?? editorial.divisionFallback;
                  return (
                    <div key={division.divisionName} className={i > 0 ? "hidden lg:block" : ""}>
                      <DivisionFieldCard
                        division={division}
                        characterization={ed.characterization}
                        rivalryNote={ed.rivalryNote}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Bold Predictions — desktop only (mobile keeps the funnel lean) */}
          {editorial.boldPredictions.length > 0 && (
            <section className="hidden lg:block">
              <ModuleLabel>Bold Predictions · Site Desk</ModuleLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {editorial.boldPredictions.map((prediction) => (
                  <BoldPredictionCard key={prediction.kicker} prediction={prediction} />
                ))}
              </div>
            </section>
          )}

          {/* Offseason Receipts — desktop only */}
          {editorial.offseasonReceipts.length > 0 && (
            <section className="hidden lg:block">
              <ModuleLabel>Offseason Receipts</ModuleLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {editorial.offseasonReceipts.map((receipt, i) => (
                  <OffseasonReceiptCard
                    key={`${receipt.category}-${i}`}
                    receipt={receipt}
                    franchise={resolveReceiptFranchise(receipt.franchiseSlug)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-12">
          {/* Burning Questions — desktop only */}
          {editorial.burningQuestions.length > 0 && (
            <section className="hidden lg:block">
              <ModuleLabel>Burning Questions</ModuleLabel>
              <BurningQuestionsCard questions={editorial.burningQuestions} />
            </section>
          )}

          {/* The Smack Feed */}
          {smackPosts.length > 0 && (
            <section>
              <ModuleLabel meta="site desk">The Smack Feed</ModuleLabel>
              <SmackFeed posts={smackPosts} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
