import type { ReactNode } from "react";
import type { WidgetSize } from "./registry";

type StatTileProps = {
  headline: ReactNode;
  caption: ReactNode;
  size: WidgetSize;
  /** Shown under the caption only when the tile is large enough. */
  details?: ReactNode;
  breakdown: { key: number; label: string; value: ReactNode }[];
  /** Always shown at the bottom of the tile. */
  footnote?: ReactNode;
};

// Large enough to fit a breakdown under the headline.
function showsBreakdown(size: WidgetSize) {
  return size.w >= 6 || size.h >= 3;
}

/**
 * The shared stat tile body: a headline and caption, plus a per-course
 * breakdown when the tile is large enough.
 */
export function StatTile({
  headline,
  caption,
  size,
  details,
  breakdown,
  footnote,
}: StatTileProps) {
  const large = showsBreakdown(size);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <p className="text-3xl font-bold">{headline}</p>
        <p className="text-sm text-muted-foreground">{caption}</p>
        {large && details && <p className="mt-1 text-sm">{details}</p>}
      </div>
      {large && breakdown.length > 0 && (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
          {breakdown.map((row) => (
            <li key={row.key} className="flex justify-between gap-4">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {row.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      {footnote && (
        <p className="mt-auto text-xs text-muted-foreground">{footnote}</p>
      )}
    </div>
  );
}
