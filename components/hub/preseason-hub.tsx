import { KickoffCountdown } from "@/components/kickoff-countdown";
import { DraftCountdown } from "@/components/draft-countdown";
import {
  SmackFeed,
  SmackComposerSlot,
  smackItemsFromPosts,
  smackItemsFromSeeds,
} from "@/components/smack-feed";
import { getSessionMember } from "@/lib/auth";
import { getRecentSmackPosts, anySmackPostsExist } from "@/lib/queries/smack";
import { EmptyState } from "@/components/empty-state";
import { DivisionFieldCard } from "@/components/hub/division-field-card";
import { BoldPredictionCard } from "@/components/hub/bold-prediction-card";
import {
  OffseasonReceiptCard,
  type ReceiptFranchise,
} from "@/components/hub/offseason-receipt-card";
import { BurningQuestionsCard } from "@/components/hub/burning-questions-card";
import { ReigningHonors } from "@/components/hub/reigning-honors";
import { TeamAwardCard } from "@/components/team-award-card";
import { StingCard } from "@/components/sting-card";
import { getHubEditorial } from "@/lib/content";
import { getPreseasonField } from "@/lib/queries/preseason-field";
import { getNextKickoff } from "@/lib/queries/kickoff";
import { getLastCompletedSeason } from "@/lib/queries/seasons";
import {
  getSeasonSuperlatives,
  getUncoveredFranchiseAwards,
  type SeasonSuperlative,
} from "@/lib/queries/superlatives";
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
  // Preseason editorial is season-scoped (week null); DB content overlays the
  // seeded defaults when present, otherwise the seeds render unchanged.
  const editorial = await getHubEditorial({ seasonId: latestSeason?.id });
  const seasonYear = latestSeason?.seasonYear ?? new Date().getFullYear();
  // When the latest synced season is already "complete", the upcoming season
  // (the one this hub is counting down to) is the year after it, not the
  // year that just finished, even though roster/record data still comes
  // from the latest synced season until the new one syncs.
  const displayYear =
    latestSeason?.status === "complete" ? seasonYear + 1 : seasonYear;

  // Field grouping + last-season records/tags, plus the Week 1 kickoff target.
  let field: Awaited<ReturnType<typeof getPreseasonField>> = {
    divisions: [],
    hasDivisions: false,
  };
  let kickoffTarget: Date | null = null;
  let lastCompletedSeasonYear: number | null = null;
  let lastCompletedSeasonId: number | null = null;
  try {
    const completedSeason = await getLastCompletedSeason();
    lastCompletedSeasonYear = completedSeason?.seasonYear ?? null;
    lastCompletedSeasonId = completedSeason?.id ?? null;
    [field, kickoffTarget] = await Promise.all([
      getPreseasonField(latestSeason?.id, completedSeason?.id),
      latestSeason ? getNextKickoff(displayYear, 1) : Promise.resolve(null),
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
  // A generated hero dek (from the content cron) wins when present; otherwise we
  // use the computed dek, which carries the live day count the LLM cannot know.
  const computedDek =
    daysToKickoff != null
      ? `Draft's in the books, rosters are locked, and every single one of you is undefeated for ${daysToKickoff} more days. Screenshot the 0-0 while you've got it.`
      : "Draft's in the books, rosters are locked, and every single one of you is undefeated. Screenshot the 0-0 while you've got it.";
  const dek = editorial.heroDek ?? computedDek;

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
        avatarUrl: team.avatarUrl,
      });
    }
  }
  const resolveReceiptFranchise = (slug: string): ReceiptFranchise =>
    franchiseBySlug.get(slug) ?? {
      slug,
      name: titleCaseSlug(slug),
      abbreviation: null,
      brandingColor: null,
      avatarUrl: null,
    };

  // Member smack feed: real posts win when present. Site Desk seeds only stand
  // in when the board is genuinely empty (no posts at all); when posts exist
  // but are all hidden, moderation must NOT resurrect the seeds. Member and
  // smack are settled independently so one failing (e.g. the members/smack
  // tables not existing yet on a pre-0008 DB) never blanks the other.
  const [memberResult, smackResult] = await Promise.allSettled([
    getSessionMember(),
    Promise.all([getRecentSmackPosts(3), anySmackPostsExist()]),
  ]);
  const sessionMember =
    memberResult.status === "fulfilled" ? memberResult.value : null;
  const [realSmack, anySmack] =
    smackResult.status === "fulfilled" ? smackResult.value : [[], false];

  const smackFromDesk = realSmack.length === 0 && !anySmack;
  const smackItems = smackFromDesk
    ? smackItemsFromSeeds(editorial.smackPosts.slice(0, 3))
    : smackItemsFromPosts(realSmack);
  const canPost = Boolean(sessionMember?.franchiseId);

  const hasField = field.divisions.length > 0;

  // Season Superlatives (Wall of Shame): the last completed season's awards,
  // plus a coverage pass so every one of the 12 franchises lands on at least
  // one card. Additive and self-contained: fetched in its own settled block so
  // a failure here never affects the rest of the hub, and the section simply
  // does not render when there is nothing (empty DB or no completed season).
  let seasonSuperlatives: SeasonSuperlative[] = [];
  try {
    const completedForAwards = await getLastCompletedSeason();
    if (completedForAwards) {
      const base = await getSeasonSuperlatives(completedForAwards.id);
      const fillers = await getUncoveredFranchiseAwards(
        completedForAwards.id,
        base.map((s) => s.franchiseSlug),
      );
      seasonSuperlatives = [...base, ...fillers];
    }
  } catch {
    // DB unavailable; the Season Superlatives section is omitted.
  }

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
            {`Harambe Memorial League · ${displayYear} · Title Defense Loading`}
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
          ) : (
            // No draft date configured (NEXT_PUBLIC_DRAFT_DATE unset, since
            // the league doesn't yet store a draft's start_time in the DB)
            // and no Week 1 schedule synced yet: say so instead of nothing.
            <div className="rounded-lg border border-border bg-surface p-6 text-center">
              <p className="text-caption uppercase text-text-tertiary mb-2">
                ROOKIE DRAFT
              </p>
              <p className="text-h2 text-text-primary">Draft date TBD</p>
            </div>
          )}
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
              {field.hasDivisions && (
                <p className="lg:hidden text-caption text-text-tertiary -mt-2 mb-4">
                  Swipe for all {field.divisions.length} divisions →
                </p>
              )}
              <div
                className={
                  field.hasDivisions
                    ? "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 no-scrollbar md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0"
                    : "grid grid-cols-1 gap-4"
                }
              >
                {field.divisions.map((division) => {
                  const ed =
                    editorial.divisions[division.divisionName] ?? editorial.divisionFallback;
                  return (
                    <div
                      key={division.divisionName}
                      className="snap-center shrink-0 basis-[85%] sm:basis-[60%] lg:basis-auto"
                    >
                      <DivisionFieldCard
                        division={division}
                        characterization={ed.characterization}
                        rivalryNote={ed.rivalryNote}
                        recordsSeasonYear={lastCompletedSeasonYear}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Bold Predictions */}
          {editorial.boldPredictions.length > 0 && (
            <section>
              <ModuleLabel>Bold Predictions · Site Desk</ModuleLabel>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {editorial.boldPredictions.map((prediction) => (
                  <BoldPredictionCard key={prediction.kicker} prediction={prediction} />
                ))}
              </div>
            </section>
          )}

          {/* Offseason Receipts */}
          {editorial.offseasonReceipts.length > 0 && (
            <section>
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
          {/* Burning Questions */}
          {editorial.burningQuestions.length > 0 && (
            <section>
              <ModuleLabel>Burning Questions</ModuleLabel>
              <BurningQuestionsCard questions={editorial.burningQuestions} />
            </section>
          )}

          {/* The Smack Feed */}
          <section>
            <ModuleLabel meta={smackFromDesk ? "site desk" : "the league"}>
              The Smack Feed
            </ModuleLabel>
            <div className="space-y-3">
              <SmackComposerSlot canPost={canPost} />
              {smackItems.length > 0 ? (
                <SmackFeed items={smackItems} />
              ) : (
                <p className="card-surface block p-4 text-body-sm text-text-tertiary">
                  Nothing on the board right now.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* Player Awards: last season's league-award winners (MVP / Finals MVP /
          Rookie of the Year), the CLAUDE.md preseason "Player Awards" slot.
          Self-gating: renders nothing until awards are seeded. */}
      {lastCompletedSeasonId != null && lastCompletedSeasonYear != null && (
        <ReigningHonors
          seasonId={lastCompletedSeasonId}
          seasonYear={lastCompletedSeasonYear}
          kicker="Player Awards · Last Season"
        />
      )}

      {/* Season Superlatives · Nobody Escapes: full-width Wall of Shame. The
          coverage pass guarantees all 12 franchises appear, so every member
          finds themselves before Week 1. */}
      {seasonSuperlatives.length > 0 && (
        <section className="pt-2 pb-8">
          <ModuleLabel
            meta={lastCompletedSeasonYear ? `${lastCompletedSeasonYear} · all 12` : "all 12"}
          >
            Season Superlatives · Nobody Escapes
          </ModuleLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {seasonSuperlatives.map((s) =>
              s.tone === "sting" ? (
                <StingCard
                  key={`${s.franchiseSlug}-${s.labelKey}`}
                  label={s.displayText}
                  franchiseName={s.franchiseName}
                  franchiseSlug={s.franchiseSlug}
                  context={s.context}
                  stat={s.stat}
                />
              ) : (
                <TeamAwardCard
                  key={`${s.franchiseSlug}-${s.labelKey}`}
                  label={s.displayText}
                  stat={s.stat}
                  context={s.context}
                  franchiseName={s.franchiseName}
                  franchiseSlug={s.franchiseSlug}
                  tone={s.tone}
                />
              ),
            )}
          </div>
        </section>
      )}
    </>
  );
}
