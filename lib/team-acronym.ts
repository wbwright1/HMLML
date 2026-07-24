export function teamAcronym(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  }
  return words
    .map((w) => (w.match(/[A-Za-z0-9]/)?.[0] ?? "").toUpperCase())
    .join("");
}
