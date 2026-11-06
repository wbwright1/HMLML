import { Crown } from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { SNARKY_LABELS } from "@/lib/content";
import { teamAcronym } from "@/lib/team-acronym";
import {
  crownOrder,
  type ArcLens,
  type ArcMode,
  type ArcSwing,
  type SeasonArc,
} from "@/lib/season-arc";

/**
 * Season Arc: a bump chart of every franchise's rank, week by week, with the
 * champion crowned in a closing "Title" column.
 *
 * Server-rendered, zero client JS. All interaction is CSS over native radio
 * inputs: the Power/Standings lens is one radio group, "follow a team" is
 * another (tap a crest, which is a <label> for that team's radio), and
 * hovering a line on desktop dims the rest via :has(). The per-team selection
 * rules are generated into a scoped <style> because the team set is data.
 *
 * Geometry: the SVG uses a 100-unit cell per week/rank with
 * preserveAspectRatio="none" so it stretches to any width, and every stroke
 * is vector-effect="non-scaling-stroke" so lines stay crisp and the
 * zero-length round-capped "dots" stay circles.
 */

export interface ArcTeam {
  franchiseId: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
}

const ROW_PX = 26;
const CREST_PX = 20;
const CELL = 100;

const LENS_COPY: Record<ArcMode, { label: string; dek: string }> = {
  power: {
    label: "Power",
    dek: "Power rank as of each week: the last four games, results first and scoring second. Injuries are left out, because nobody kept receipts on who was hurt in Week 6.",
  },
  standings: {
    label: "Standings",
    dek: "Where the standings had you after each week: record first, points for as the tiebreaker.",
  },
};

function x(col: number) {
  return (col + 0.5) * CELL;
}
function y(rank: number) {
  return (rank - 0.5) * CELL;
}

function teamKey(index: number) {
  return `t${index}`;
}

function abbr(team: ArcTeam) {
  return team.abbreviation ?? teamAcronym(team.name);
}

function scopedCss(rootId: string, teamCount: number): string {
  const r = `#${rootId}`;
  const rules: string[] = [
    // Lens toggle.
    `${r}:has(#${rootId}-lens-standings:checked) [data-lens="power"]{display:none}`,
    `${r}:has(#${rootId}-lens-power:checked) [data-lens="standings"]{display:none}`,
    // Something is followed: dim everything, then lift the followed team.
    `${r}:has(input[data-arc-team]:checked) .arc-team{opacity:.14}`,
    `${r}:has(input[data-arc-team]:checked) .arc-crest{opacity:.4}`,
    `${r}:has(input[data-arc-team]:checked) .arc-clear{display:inline}`,
    `${r}:has(input[data-arc-team]:checked) .arc-hint{display:none!important}`,
    // Desktop hover, only while nothing is followed.
    `${r}:not(:has(input[data-arc-team]:checked)) .arc-plot:has(.arc-team:hover) .arc-team:not(:hover){opacity:.14}`,
    `${r} .arc-team:hover .arc-line{stroke:var(--text-primary)}`,
    `${r} .arc-team:hover .arc-dot{opacity:1}`,
  ];
  for (let i = 0; i < teamCount; i++) {
    const k = teamKey(i);
    const on = `${r}:has(#${rootId}-${k}:checked)`;
    rules.push(
      `${on} .arc-team[data-team="${k}"]{opacity:1}`,
      `${on} .arc-team[data-team="${k}"] .arc-line,${on} .arc-team[data-team="${k}"] .arc-ext{stroke:var(--accent-gold);stroke-width:3}`,
      `${on} .arc-team[data-team="${k}"] .arc-dot{opacity:1;stroke:var(--accent-gold)}`,
      `${on} .arc-crest[data-team="${k}"]{opacity:1}`,
      `${on} .arc-crest[data-team="${k}"] .arc-crest-ring{box-shadow:0 0 0 2px var(--accent-gold)}`,
      `${r}:has(#${rootId}-${k}:focus-visible) .arc-crest[data-team="${k}"] .arc-crest-ring{box-shadow:0 0 0 2px var(--text-primary)}`,
    );
  }
  return rules.join("\n");
}

function CrestLabel({
  rootId,
  team,
  teamIndex,
  top,
  showAbbr,
  crowned,
}: {
  rootId: string;
  team: ArcTeam;
  teamIndex: number;
  top: number;
  showAbbr: boolean;
  crowned?: boolean;
}) {
  const k = teamKey(teamIndex);
  return (
    <label
      htmlFor={`${rootId}-${k}`}
      data-team={k}
      className="arc-crest absolute left-0 flex cursor-pointer items-center gap-1.5 transition-opacity duration-150"
      style={{ top: top + (ROW_PX - CREST_PX) / 2, height: CREST_PX }}
    >
      {crowned !== undefined && (
        <span className="flex w-3.5 justify-center" aria-hidden>
          {crowned && (
            <Crown className="size-3.5 text-accent-gold" strokeWidth={2.25} />
          )}
        </span>
      )}
      <span className="arc-crest-ring rounded-[6px]">
        <FranchiseLogo
          slug={team.slug}
          name={team.name}
          abbreviation={team.abbreviation}
          brandingColor={team.brandingColor}
          avatarUrl={team.avatarUrl}
          size={CREST_PX}
          decorative
        />
      </span>
      {showAbbr && (
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            crowned ? "text-accent-gold" : "text-text-tertiary"
          }`}
        >
          {abbr(team)}
        </span>
      )}
    </label>
  );
}

function Callout({
  team,
  badge,
  variant,
  children,
}: {
  team: ArcTeam;
  badge: string;
  variant: "gold" | "green" | "brown";
  children: React.ReactNode;
}) {
  return (
    <div className="card-surface flex flex-col gap-2 p-4">
      <div>
        <SuperlativeBadge text={badge} variant={variant} />
      </div>
      <div className="flex items-center gap-2">
        <FranchiseLogo
          slug={team.slug}
          name={team.name}
          abbreviation={team.abbreviation}
          brandingColor={team.brandingColor}
          avatarUrl={team.avatarUrl}
          size={20}
          decorative
        />
        <span className="truncate text-body-sm font-semibold text-text-primary">
          {team.name}
        </span>
      </div>
      <p className="text-body-sm text-text-secondary">{children}</p>
    </div>
  );
}

function Rank({ n }: { n: number }) {
  return (
    <span className="font-mono font-bold tabular-nums text-text-primary">
      #{n}
    </span>
  );
}

function SwingLine({ swing }: { swing: ArcSwing }) {
  return (
    <>
      <Rank n={swing.fromRank} /> in Week{" "}
      <span className="font-mono tabular-nums">{swing.fromWeek}</span> to{" "}
      <Rank n={swing.toRank} /> by Week{" "}
      <span className="font-mono tabular-nums">{swing.toWeek}</span>.
    </>
  );
}

const SPARK_W = 76;
const SPARK_H = 32;

/** One team's season as a tiny rank line: #1 at the top, the top-three zone
 * tinted, a dot on the final week. Same non-scaling-stroke trick as the big
 * chart so it stays crisp at any width. */
function Sparkline({
  ranks,
  teamCount,
  tone,
}: {
  ranks: number[];
  teamCount: number;
  tone: "gold" | "ink";
}) {
  const cols = ranks.length;
  const w = cols * CELL;
  const h = teamCount * CELL;
  const pts = ranks.map((rk, i) => `${x(i)},${y(rk)}`).join(" ");
  const last = ranks.length - 1;
  const stroke =
    tone === "gold" ? "var(--accent-gold)" : "var(--text-secondary)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block shrink-0 overflow-visible"
      style={{ width: SPARK_W, height: SPARK_H }}
      aria-hidden
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={3 * CELL}
        fill="var(--accent-gold-light)"
        opacity={0.5}
      />
      <line
        x1={0}
        x2={w}
        y1={h}
        y2={h}
        stroke="var(--border)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M${x(last)} ${y(ranks[last])}l0 0`}
        stroke={stroke}
        strokeWidth={6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Season-long move, first week to last: sage ▲ / rust ▼ always with the
 * number, dash for no change. */
function Delta({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="font-mono text-sm tabular-nums text-text-tertiary">
        <span aria-hidden>–</span>
        <span className="sr-only">no change</span>
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={`font-mono text-sm font-bold tabular-nums ${
        up ? "text-accent-green" : "text-accent-warm"
      }`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(value)}
      <span className="sr-only">
        {up ? " spots up" : " spots down"} on the season
      </span>
    </span>
  );
}

/**
 * Phone layout: small multiples. One row per team, ordered by how the season
 * ended (champion first when there is one), each with its own sparkline, so
 * nothing crosses and every row screenshots on its own.
 */
function MobileArcList({
  lens,
  weeks,
  teams,
  championId,
}: {
  lens: ArcLens;
  weeks: number[];
  teams: ArcTeam[];
  championId: string | null;
}) {
  const byId = new Map(teams.map((t) => [t.franchiseId, t]));
  const lastCol = weeks.length - 1;
  const order = championId ? crownOrder(lens.series, championId) : null;
  const rows = [...lens.series].sort(
    (a, b) =>
      (order?.get(a.franchiseId) ?? a.ranks[lastCol]) -
      (order?.get(b.franchiseId) ?? b.ranks[lastCol]),
  );

  return (
    <div className="sm:hidden" aria-hidden>
      <div className="mb-2 flex items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-text-tertiary">
        <span>Final</span>
        <span className="flex items-center gap-2.5">
          <span className="text-center" style={{ width: SPARK_W }}>
            Wk <span className="font-mono tabular-nums">{weeks[0]}</span>–
            <span className="font-mono tabular-nums">{weeks[lastCol]}</span>
          </span>
          <span className="w-8 text-right">Move</span>
        </span>
      </div>
      <ol className="overflow-hidden rounded-[14px] border border-border divide-y divide-divider">
        {rows.map((s, i) => {
          const team = byId.get(s.franchiseId)!;
          const isChamp = s.franchiseId === championId;
          const endRank = s.ranks[lastCol];
          return (
            <li
              key={s.franchiseId}
              className={`flex items-center gap-2.5 px-3 py-2.5 ${
                isChamp ? "bg-accent-gold-light" : ""
              }`}
            >
              <span
                className={`w-5 shrink-0 text-center font-mono text-sm font-bold tabular-nums ${
                  isChamp || i < 3 ? "text-accent-gold" : "text-text-tertiary"
                }`}
              >
                {isChamp ? (
                  <Crown className="mx-auto size-4" strokeWidth={2.25} />
                ) : (
                  i + 1
                )}
              </span>
              <FranchiseLogo
                slug={team.slug}
                name={team.name}
                abbreviation={team.abbreviation}
                brandingColor={team.brandingColor}
                avatarUrl={team.avatarUrl}
                size={24}
                decorative
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-body-sm font-semibold ${
                    isChamp ? "text-accent-gold" : "text-text-primary"
                  }`}
                >
                  {team.name}
                </p>
                <p className="whitespace-nowrap font-mono text-[11px] tabular-nums text-text-tertiary">
                  #{s.ranks[0]} → #{endRank}
                </p>
              </div>
              <Sparkline
                ranks={s.ranks}
                teamCount={teams.length}
                tone={isChamp ? "gold" : "ink"}
              />
              <span className="w-8 shrink-0 text-right">
                <Delta value={s.ranks[0] - endRank} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LensPanel({
  rootId,
  mode,
  lens,
  weeks,
  teams,
  championId,
}: {
  rootId: string;
  mode: ArcMode;
  lens: ArcLens;
  weeks: number[];
  teams: ArcTeam[];
  championId: string | null;
}) {
  const n = teams.length;
  const indexOf = new Map(teams.map((t, i) => [t.franchiseId, i]));
  const byId = new Map(teams.map((t) => [t.franchiseId, t]));
  const hasCrown = championId != null && indexOf.has(championId);
  const cols = weeks.length + (hasCrown ? 1 : 0);
  const lastCol = weeks.length - 1;
  const endRank = hasCrown ? crownOrder(lens.series, championId) : null;
  const plotHeight = n * ROW_PX;

  const champSeries = hasCrown
    ? lens.series.find((s) => s.franchiseId === championId)
    : undefined;
  const champFinalRank = champSeries?.ranks[lastCol];

  // Draw the champion last so its gold line sits on top of the pile.
  const drawOrder = [...lens.series].sort(
    (a, b) =>
      Number(a.franchiseId === championId) -
      Number(b.franchiseId === championId),
  );

  const rise = lens.biggestRise;
  const fall = lens.biggestFall;
  const wire = lens.wireToWire;

  return (
    <div data-lens={mode} className="space-y-6">
      <p className="max-w-prose text-body-sm text-text-tertiary">
        {LENS_COPY[mode].dek}
      </p>

      <MobileArcList
        lens={lens}
        weeks={weeks}
        teams={teams}
        championId={hasCrown ? championId : null}
      />

      {/* Desktop/tablet: the bump chart. Twelve crossing lines need width, so
          phones get the small multiples above instead. */}
      <div aria-hidden className="hidden gap-3 sm:flex">
        {/* Rank axis */}
        <div
          className="flex w-5 shrink-0 flex-col"
          style={{ height: plotHeight }}
        >
          {teams.map((_, i) => (
            <span
              key={i}
              className={`flex items-center justify-end font-mono text-[10px] tabular-nums ${
                i < 3 ? "text-accent-gold" : "text-text-tertiary"
              }`}
              style={{ height: ROW_PX }}
            >
              {i + 1}
            </span>
          ))}
        </div>

        {/* Week-one crests (hidden on phones; the axis carries the rank) */}
        <div className="relative w-5 shrink-0" style={{ height: plotHeight }}>
          {lens.series.map((s) => {
            const idx = indexOf.get(s.franchiseId)!;
            return (
              <CrestLabel
                key={s.franchiseId}
                rootId={rootId}
                team={teams[idx]}
                teamIndex={idx}
                top={(s.ranks[0] - 1) * ROW_PX}
                showAbbr={false}
              />
            );
          })}
        </div>

        {/* Plot */}
        <div className="min-w-0 flex-1">
          <svg
            className="arc-plot block w-full overflow-visible"
            style={{ height: plotHeight }}
            viewBox={`0 0 ${cols * CELL} ${n * CELL}`}
            preserveAspectRatio="none"
            role="presentation"
          >
            {/* Row guides, with the playoff line implied by the top 3 tint */}
            {teams.map((_, i) => (
              <line
                key={i}
                x1={0}
                x2={cols * CELL}
                y1={y(i + 1)}
                y2={y(i + 1)}
                stroke="var(--divider)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hasCrown && (
              <rect
                x={weeks.length * CELL}
                y={0}
                width={CELL}
                height={n * CELL}
                fill="var(--accent-gold-light)"
                opacity={0.6}
              />
            )}

            {drawOrder.map((s) => {
              const idx = indexOf.get(s.franchiseId)!;
              const isChamp = s.franchiseId === championId;
              const pts = s.ranks.map((rk, i) => `${x(i)},${y(rk)}`).join(" ");
              const end = endRank?.get(s.franchiseId);
              return (
                <g
                  key={s.franchiseId}
                  className="arc-team transition-opacity duration-150"
                  data-team={teamKey(idx)}
                >
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="stroke"
                  />
                  <polyline
                    className="arc-line"
                    points={pts}
                    fill="none"
                    stroke={
                      isChamp ? "var(--accent-gold)" : "var(--text-muted)"
                    }
                    strokeWidth={isChamp ? 2.5 : 1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  {end != null && (
                    <line
                      className="arc-ext"
                      x1={x(lastCol)}
                      y1={y(s.ranks[lastCol])}
                      x2={x(weeks.length)}
                      y2={y(end)}
                      stroke={
                        isChamp ? "var(--accent-gold)" : "var(--text-muted)"
                      }
                      strokeWidth={isChamp ? 2.5 : 1}
                      strokeDasharray={isChamp ? "5 4" : "2 4"}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {s.ranks.map((rk, i) => (
                    <path
                      key={i}
                      className="arc-dot transition-opacity duration-150"
                      d={`M${x(i)} ${y(rk)}l0 0`}
                      stroke="var(--text-primary)"
                      strokeWidth={7}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={0}
                    />
                  ))}
                </g>
              );
            })}
          </svg>

          {/* Week axis */}
          <div
            className="mt-2 grid"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {weeks.map((w, i) => (
              <span
                key={w}
                className={`text-center font-mono text-[10px] tabular-nums text-text-tertiary ${
                  i % 2 === 1 && i !== lastCol ? "max-sm:invisible" : ""
                }`}
              >
                {w}
              </span>
            ))}
            {hasCrown && (
              <span className="flex justify-center">
                <Crown className="size-3 text-accent-gold" strokeWidth={2.25} />
              </span>
            )}
          </div>
          <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[.18em] text-text-tertiary">
            Week
          </p>
        </div>

        {/* End crests: final-week order, or the crowned order when there is a champion */}
        <div
          className={`relative shrink-0 ${hasCrown ? "w-[86px]" : "w-[66px]"}`}
          style={{ height: plotHeight }}
        >
          {lens.series.map((s) => {
            const idx = indexOf.get(s.franchiseId)!;
            const rank = endRank?.get(s.franchiseId) ?? s.ranks[lastCol];
            return (
              <CrestLabel
                key={s.franchiseId}
                rootId={rootId}
                team={teams[idx]}
                teamIndex={idx}
                top={(rank - 1) * ROW_PX}
                showAbbr
                crowned={hasCrown ? s.franchiseId === championId : undefined}
              />
            );
          })}
        </div>
      </div>

      {(hasCrown || rise || fall || wire) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hasCrown && champFinalRank != null && (
            <Callout
              team={byId.get(championId!)!}
              badge="Champion"
              variant="gold"
            >
              {champFinalRank === 1 ? (
                <>
                  Finished the regular season <Rank n={1} /> here and closed the
                  deal. No notes.
                </>
              ) : (
                <>
                  Finished the regular season <Rank n={champFinalRank} /> here
                  and took the whole thing anyway.
                </>
              )}
            </Callout>
          )}
          {wire && (
            <Callout
              team={byId.get(wire)!}
              badge={SNARKY_LABELS.WIRE_TO_WIRE.displayText}
              variant="green"
            >
              <Rank n={1} /> every single week. Nobody else got a turn.
            </Callout>
          )}
          {rise && (
            <Callout
              team={byId.get(rise.franchiseId)!}
              badge={SNARKY_LABELS.GLOW_UP.displayText}
              variant="green"
            >
              <span className="text-accent-green" aria-hidden>
                ▲
              </span>{" "}
              <span className="font-mono font-bold tabular-nums text-accent-green">
                {rise.spots}
              </span>{" "}
              spots: <SwingLine swing={rise} />
            </Callout>
          )}
          {fall && (
            <Callout
              team={byId.get(fall.franchiseId)!}
              badge={SNARKY_LABELS.FREEFALL.displayText}
              variant="brown"
            >
              <span className="text-accent-warm" aria-hidden>
                ▼
              </span>{" "}
              <span className="font-mono font-bold tabular-nums text-accent-warm">
                {fall.spots}
              </span>{" "}
              spots: <SwingLine swing={fall} />
            </Callout>
          )}
        </div>
      )}

      {/* The chart itself is aria-hidden; this is the same data for screen readers. */}
      {/* sr-only on the wrapper: a table ignores the 1px width and would
          force horizontal scroll on phones. */}
      <div className="sr-only">
        <table>
          <caption>
            {LENS_COPY[mode].label} rank by week
            {hasCrown ? `. Champion: ${byId.get(championId!)!.name}` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              {weeks.map((w) => (
                <th key={w} scope="col">
                  Week {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...lens.series]
              .sort((a, b) => a.ranks[lastCol] - b.ranks[lastCol])
              .map((s) => (
                <tr key={s.franchiseId}>
                  <th scope="row">{byId.get(s.franchiseId)!.name}</th>
                  {s.ranks.map((rk, i) => (
                    <td key={i}>{rk}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SeasonArcChart({
  arc,
  teams,
  championId,
  year,
}: {
  arc: SeasonArc;
  teams: ArcTeam[];
  championId: string | null;
  year: number;
}) {
  const rootId = `season-arc-${year}`;

  return (
    <div id={rootId} data-testid="season-arc" className="space-y-5">
      <style>{scopedCss(rootId, teams.length)}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="inline-flex rounded-full border border-border bg-surface p-1">
          <legend className="sr-only">Rank by</legend>
          {(["power", "standings"] as const).map((mode) => (
            <label
              key={mode}
              className="cursor-pointer rounded-full px-4 py-1.5 text-body-sm font-medium text-text-tertiary transition-colors has-[:checked]:bg-accent-gold-light has-[:checked]:text-accent-gold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name={`${rootId}-lens`}
                id={`${rootId}-lens-${mode}`}
                value={mode}
                defaultChecked={mode === "power"}
                className="sr-only"
              />
              {LENS_COPY[mode].label}
            </label>
          ))}
        </fieldset>

        <p className="arc-hint hidden text-body-sm text-text-tertiary sm:block">
          Tap a crest to follow one team&apos;s line.
        </p>
        <label
          htmlFor={`${rootId}-none`}
          className="arc-clear hidden cursor-pointer text-body-sm font-medium text-accent-gold hover:brightness-110"
        >
          Show everyone
        </label>
      </div>

      <fieldset className="sr-only">
        <legend className="sr-only">Follow one team&apos;s line</legend>
        <input
          type="radio"
          name={`${rootId}-team`}
          id={`${rootId}-none`}
          value=""
          defaultChecked
          className="sr-only"
          aria-label="Show every team"
        />
        {teams.map((t, i) => (
          <input
            key={t.franchiseId}
            type="radio"
            name={`${rootId}-team`}
            id={`${rootId}-${teamKey(i)}`}
            value={t.slug}
            data-arc-team
            className="sr-only"
            aria-label={`Follow ${t.name}`}
          />
        ))}
      </fieldset>

      {(["power", "standings"] as const).map((mode) => (
        <LensPanel
          key={mode}
          rootId={rootId}
          mode={mode}
          lens={arc[mode]}
          weeks={arc.weeks}
          teams={teams}
          championId={championId}
        />
      ))}
    </div>
  );
}
