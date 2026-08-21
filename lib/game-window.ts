/**
 * Whether a given moment plausibly falls inside an NFL game window.
 *
 * Deliberately broad and season-blind: callers pair it with a season check
 * (the API route) or treat it as a cheap "is it worth asking the server"
 * pre-filter (the nav's live pill island). Evaluated in US Eastern so the
 * windows hold under DST from any server or client timezone.
 *
 * Windows: Thursday from 7pm, Saturday from 1pm, Sunday from 11am, Monday
 * from 7pm.
 */
export function isPlausibleGameWindow(now: Date = new Date()): boolean {
  // Reading the wall clock through en-US/New_York keeps DST correct without
  // pulling in a timezone library.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourRaw = parts.find((p) => p.type === "hour")?.value;
  if (!weekday || !hourRaw) return false;

  // "24" appears for midnight in some ICU versions.
  const hour = parseInt(hourRaw, 10) % 24;

  switch (weekday) {
    case "Thu":
      return hour >= 19;
    case "Sat":
      return hour >= 13;
    case "Sun":
      return hour >= 11;
    case "Mon":
      return hour >= 19;
    default:
      return false;
  }
}
