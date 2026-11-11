import {
  GRID_COLUMNS,
  widgets,
  type WidgetId,
  type WidgetLayoutItem,
} from "./registry";

// ─── Layout Helpers ───
// Client-safe layout calculations shared by the dashboard and its editor.

/** Grid row height and gap, shared by the static grid and the editor. */
export const GRID_ROW_HEIGHT_PX = 88;
export const GRID_GAP_PX = 16;

/** The edits a layout save can come from; only "add" needs new widget data. */
export const LAYOUT_CHANGES = ["move", "resize", "add", "remove"] as const;
export type LayoutChange = (typeof LAYOUT_CHANGES)[number];

function overlaps(a: WidgetLayoutItem, b: WidgetLayoutItem) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * Places a widget at its default size in the first free spot, scanning rows
 * top to bottom and columns left to right.
 */
export function placeWidget(
  layout: WidgetLayoutItem[],
  widgetId: WidgetId
): WidgetLayoutItem {
  const { w, h } = widgets[widgetId].defaultSize;

  for (let y = 0; ; y++) {
    for (let x = 0; x + w <= GRID_COLUMNS; x++) {
      const candidate = { widgetId, x, y, w, h };
      if (!layout.some((item) => overlaps(item, candidate))) return candidate;
    }
  }
}

/** Registry widgets not currently on the dashboard. */
export function getHiddenWidgetIds(layout: WidgetLayoutItem[]) {
  const shown = new Set(layout.map((item) => item.widgetId));
  return (Object.keys(widgets) as WidgetId[]).filter((id) => !shown.has(id));
}

/** Reading order for the stacked single-column layout on narrow screens. */
export function inReadingOrder(layout: WidgetLayoutItem[]) {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}
