/**
 * Prints copy with every numeral in the mono/tabular face and every word in
 * the surrounding Geist (the three-font rule: mono wraps numbers only). A
 * signed figure keeps its sign ("+53.5", "-165"), and a record or series
 * stays one run ("7-4", "2-1-1"). The one place the hub sets a numeral in
 * the serif is the hero headline, which never passes through here.
 */
export function MonoNums({ text }: { text: string }) {
  const parts = text.split(/([+−-]?\d+(?:[.,]\d+)*(?:-\d+)*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[+−-]?\d/.test(part) ? (
          <span key={i} className="font-mono tabular-nums">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
