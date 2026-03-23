import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { getDraftsByYear } from "@/lib/queries/drafts";

export const metadata = {
  title: "Drafts | Harambe Memorial League Memorial League",
  description:
    "Complete draft boards and pick-by-pick results for every Harambe Memorial League Memorial League draft.",
};

export default async function DraftsPage() {
  let drafts: Awaited<ReturnType<typeof getDraftsByYear>> = [];

  try {
    drafts = await getDraftsByYear();
  } catch {
    // DB may not be connected in dev
  }

  if (drafts.length === 0) {
    return (
      <PageSection label="Draft Room" title="Drafts">
        <p className="text-body-lg text-muted-foreground">
          No draft data available yet. Check back once drafts have been synced
          from Sleeper.
        </p>
      </PageSection>
    );
  }

  // Group drafts by season year for display
  const draftsByYear = new Map<number, typeof drafts>();
  for (const draft of drafts) {
    if (!draftsByYear.has(draft.seasonYear)) {
      draftsByYear.set(draft.seasonYear, []);
    }
    draftsByYear.get(draft.seasonYear)!.push(draft);
  }

  const years = Array.from(draftsByYear.keys()).sort((a, b) => b - a);

  return (
    <PageSection label="Draft Room" title="Drafts">
      <p className="text-body-lg text-muted-foreground max-w-prose">
        Complete draft boards and pick-by-pick results for every Harambe
        Memorial League draft.
      </p>

      <div className="mt-8 space-y-4">
        {years.map((year, yearIndex) => {
          const yearDrafts = draftsByYear.get(year)!;

          return yearDrafts.map((draft, draftIndex) => (
            <ScrollReveal
              key={draft.draftId}
              delay={(yearIndex * yearDrafts.length + draftIndex) * 50}
            >
              <Link
                href={`/drafts/${year}`}
                className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-card/80"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-h3 group-hover:text-primary transition-colors">
                      {year}
                    </span>
                    <DraftTypeBadge
                      draftType={draft.draftType}
                      isLegacyEra={draft.isLegacyEra}
                    />
                  </div>
                  <p className="text-body-sm text-muted-foreground">
                    {draft.pickCount} picks
                  </p>
                </div>

                <span
                  className="text-muted-foreground group-hover:text-foreground transition-colors"
                  aria-hidden="true"
                >
                  &rarr;
                </span>
              </Link>
            </ScrollReveal>
          ));
        })}
      </div>
    </PageSection>
  );
}

function DraftTypeBadge({
  draftType,
  isLegacyEra,
}: {
  draftType: string;
  isLegacyEra: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <SuperlativeBadge
        text={draftType === "startup" ? "Startup" : "Rookie"}
        variant={draftType === "startup" ? "green" : "neutral"}
      />
      {isLegacyEra && (
        <span className="text-xs uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          Legacy Era
        </span>
      )}
    </div>
  );
}
