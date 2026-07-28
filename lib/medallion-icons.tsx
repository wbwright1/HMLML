// Engraved coin icons for the Medallion Podium trophy shelf. Paths lifted
// directly from docs/design_handoff_trophy_case/trophy-case-2a.html (24x24
// viewBox, stroke-only, no fill) — one icon per hardware type. Server
// component, zero client JS.

export type MedallionIconType =
  | "champion"
  | "championship_mvp"
  | "regular_season_mvp"
  | "rookie_of_year";

interface MedallionIconProps {
  type: MedallionIconType;
}

const ICON_STROKE = "#4A3A12";

function ChampionIcon() {
  return (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5c0 3.5 2 5.5 4 5.5M17 6h2.5c0 3.5-2 5.5-4 5.5" />
      <path d="M12 14v3M9 20h6" />
    </>
  );
}

function ChampionshipMvpIcon() {
  return (
    <>
      <ellipse cx={12} cy={12} rx={8} ry={5.2} transform="rotate(-24 12 12)" />
      <path d="M9 13.3l6-2.6" />
    </>
  );
}

function RegularSeasonMvpIcon() {
  return <path d="M12 4l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.3l5-.7z" />;
}

function RookieOfYearIcon() {
  return (
    <>
      <path d="M7 13.5l5-3.8 5 3.8M7 18l5-3.8 5 3.8" />
      <path d="M12 4l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 6.3 11 6z" />
    </>
  );
}

/**
 * Engraved medallion icon, 24x24 viewBox. Rendered at whatever pixel size the
 * caller sizes the enclosing <svg> to (32-42px on the medallion coin).
 */
export function MedallionIcon({ type }: MedallionIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={ICON_STROKE}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "champion" && <ChampionIcon />}
      {type === "championship_mvp" && <ChampionshipMvpIcon />}
      {type === "regular_season_mvp" && <RegularSeasonMvpIcon />}
      {type === "rookie_of_year" && <RookieOfYearIcon />}
    </svg>
  );
}
