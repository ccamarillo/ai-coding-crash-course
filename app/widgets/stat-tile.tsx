import type { ReactNode } from "react";
import type { WidgetSize } from "./registry";

type StatTileProps = {
  headline: ReactNode;
  caption: ReactNode;
  size: WidgetSize;
  breakdown: { key: number; label: string; value: ReactNode }[];
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
  breakdown,
}: StatTileProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <p className="text-3xl font-bold">{headline}</p>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      {showsBreakdown(size) && breakdown.length > 0 && (
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
    </div>
  );
}
