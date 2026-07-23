interface MobileTableViewProps {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
  keyColumns?: number[];
  /**
   * Optional column index promoted to a full-width, left-aligned header row at
   * the top of each mobile card (no kicker label, no right-align, no truncate).
   * Use it for the identifying column (e.g. a player name) so it reads as the
   * card title instead of a cramped label/value row. Remaining columns still
   * render as label/value pairs. When undefined, every column renders as a
   * label/value pair (original behavior).
   */
  primaryColumn?: number;
}

export function MobileTableView({
  headers,
  rows,
  keyColumns,
  primaryColumn,
}: MobileTableViewProps) {
  const visibleColumns = keyColumns ?? headers.map((_, i) => i);
  const detailColumns =
    primaryColumn != null
      ? visibleColumns.filter((colIndex) => colIndex !== primaryColumn)
      : visibleColumns;

  return (
    <>
      {/* Mobile: stacked cards (hidden on md+) */}
      <div className="md:hidden space-y-3" role="list">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="rounded-[14px] border border-border bg-surface p-4 space-y-2"
            role="listitem"
          >
            {primaryColumn != null && (
              <div className="text-body-sm font-medium text-text-primary">
                {row[primaryColumn]}
              </div>
            )}
            {detailColumns.map((colIndex) => (
              <div
                key={`${rowIndex}-${headers[colIndex]}`}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-kicker shrink-0">
                  {headers[colIndex]}
                </span>
                <span className="text-sm font-medium text-right truncate text-text-primary">
                  {row[colIndex]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Desktop: full HTML table (hidden below md) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              {headers.map((header) => (
                <th
                  key={header}
                  className="pb-3 pr-4 last:pr-0 text-left text-kicker"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-divider last:border-0"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${headers[cellIndex]}`}
                    className="py-4 pr-4 last:pr-0 text-sm text-text-secondary tabular-nums"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
