/**
 * Renders a copy string with its numerals in the mono face and its words in
 * Geist, for Book copy that carries prices inline ("Spread bets pay -110: a
 * $10 friendly returns $19.09"). The site rule is mono for numbers only, so a
 * sentence can't just be wrapped in font-mono whole.
 *
 * A token is a run of digits with its sign, dollar sign, decimal point and
 * thousands commas attached. A digit glued to letters ("E2", a team code) is
 * left alone. Plain server-safe markup; no client boundary.
 */
const NUMERAL = /((?<![A-Za-z])[+-]?\$?\d[\d,]*(?:\.\d+)?%?)/;

export function MonoNumerals({ text }: { text: string }) {
  const parts = text.split(NUMERAL);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-mono tabular-nums">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
