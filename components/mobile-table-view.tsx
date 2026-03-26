interface MobileTableViewProps {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
  keyColumns?: number[];
}

export function MobileTableView({
  headers,
  rows,
  keyColumns,
}: MobileTableViewProps) {
  const visibleColumns = keyColumns ?? headers.map((_, i) => i);

  return (
    <>
      {/* Mobile: stacked cards (hidden on md+) */}
      <div className="md:hidden space-y-3" role="list">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="rounded-xl border border-border bg-card p-4 space-y-2"
            role="listitem"
          >
            {visibleColumns.map((colIndex) => (
              <div
                key={`${rowIndex}-${headers[colIndex]}`}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium shrink-0">
                  {headers[colIndex]}
                </span>
                <span className="text-sm font-medium text-right truncate">
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
                  className="pb-3 pr-4 last:pr-0 text-xs uppercase tracking-wider text-muted-foreground font-medium"
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
                className="border-b border-border/50 last:border-0"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${headers[cellIndex]}`}
                    className="py-4 pr-4 last:pr-0 text-sm"
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
