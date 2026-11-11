import { eq } from "drizzle-orm";
import { db } from "~/db";
import { instructorDashboardWidgets } from "~/db/schema";
import {
  DEFAULT_LAYOUT,
  GRID_COLUMNS,
  widgets,
  type WidgetId,
  type WidgetLayoutItem,
} from "~/widgets/registry";

// ─── Dashboard Layout Service ───
// Stores each instructor's customized dashboard layout. Instructors with no
// saved rows get the registry's default layout, so improvements to the
// default reach everyone who hasn't customized.
// Uses positional parameters (project convention).

/** A layout as submitted, before saveLayout checks it against the registry. */
export type LayoutInput = Omit<WidgetLayoutItem, "widgetId"> & {
  widgetId: string;
};

export function getLayout(userId: number): WidgetLayoutItem[] {
  const rows = db
    .select({
      widgetId: instructorDashboardWidgets.widgetId,
      x: instructorDashboardWidgets.x,
      y: instructorDashboardWidgets.y,
      w: instructorDashboardWidgets.w,
      h: instructorDashboardWidgets.h,
    })
    .from(instructorDashboardWidgets)
    .where(eq(instructorDashboardWidgets.userId, userId))
    .orderBy(instructorDashboardWidgets.id)
    .all();

  // A widget retired from the registry since it was saved can't render.
  const layout = rows.filter((row): row is WidgetLayoutItem =>
    isWidgetId(row.widgetId)
  );

  return layout.length === 0 ? DEFAULT_LAYOUT : layout;
}

function isWidgetId(id: string): id is WidgetId {
  return Object.hasOwn(widgets, id);
}

/**
 * Throws if the layout can't be saved: it must hold at least one widget, each
 * a registry widget shown at most once, placed on the 12-column grid within
 * that widget's size limits.
 */
function validateLayout(
  layout: LayoutInput[]
): asserts layout is WidgetLayoutItem[] {
  // An empty layout would read back as the default, not as empty.
  if (layout.length === 0) {
    throw new Error("A dashboard needs at least one widget.");
  }

  const seen = new Set<string>();
  for (const item of layout) {
    if (!isWidgetId(item.widgetId)) {
      throw new Error(`Unknown widget "${item.widgetId}".`);
    }
    if (seen.has(item.widgetId)) {
      throw new Error(`Widget "${item.widgetId}" appears more than once.`);
    }
    seen.add(item.widgetId);

    const { x, y, w, h } = item;
    if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0) {
      throw new Error(`Widget "${item.widgetId}" has an invalid position.`);
    }
    if (x + w > GRID_COLUMNS) {
      throw new Error(`Widget "${item.widgetId}" extends past the grid.`);
    }

    const { minSize, maxSize } = widgets[item.widgetId];
    if (w < minSize.w || h < minSize.h || w > maxSize.w || h > maxSize.h) {
      throw new Error(`Widget "${item.widgetId}" is outside its size limits.`);
    }
  }
}

/**
 * Validates the full layout, then replaces the user's rows with it in one
 * transaction. A rejected layout writes nothing.
 */
export function saveLayout(userId: number, layout: LayoutInput[]) {
  validateLayout(layout);

  db.transaction((tx) => {
    tx.delete(instructorDashboardWidgets)
      .where(eq(instructorDashboardWidgets.userId, userId))
      .run();

    tx.insert(instructorDashboardWidgets)
      .values(
        layout.map(({ widgetId, x, y, w, h }) => ({
          userId,
          widgetId,
          x,
          y,
          w,
          h,
        }))
      )
      .run();
  });
}
