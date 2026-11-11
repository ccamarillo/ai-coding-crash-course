import type { ComponentType } from "react";
import type { DashboardRange } from "~/lib/dashboard-range";
import { completionRateWidget } from "./completion-rate";
import { enrollmentsWidget } from "./enrollments";
import { grossSalesWidget } from "./gross-sales";
import { quizScoresWidget } from "./quiz-scores";

// ─── Widget Registry ───
// One module per instructor dashboard widget. This file is client-safe: it
// holds what the grid and tiles need. Each widget's server-side data function
// lives in registry.server.ts so the database never reaches the client bundle.

export const GRID_COLUMNS = 12;

export type WidgetSize = { w: number; h: number };

export type WidgetTileProps<TData> = {
  data: TData;
  size: WidgetSize;
  range: DashboardRange;
};

export type WidgetDefinition<TData> = {
  id: string;
  title: string;
  description: string;
  defaultSize: WidgetSize;
  minSize: WidgetSize;
  maxSize: WidgetSize;
  Tile: ComponentType<WidgetTileProps<TData>>;
};

export const widgets = {
  enrollments: enrollmentsWidget,
  "gross-sales": grossSalesWidget,
  "completion-rate": completionRateWidget,
  "quiz-scores": quizScoresWidget,
};

export type WidgetId = keyof typeof widgets;

export type WidgetData<K extends WidgetId> =
  (typeof widgets)[K] extends WidgetDefinition<infer TData> ? TData : never;

export type WidgetLayoutItem = { widgetId: WidgetId } & WidgetSize & {
    x: number;
    y: number;
  };

/** The layout shown to instructors who have not customized their dashboard. */
export const DEFAULT_LAYOUT: WidgetLayoutItem[] = [
  { widgetId: "enrollments", x: 0, y: 0, w: 6, h: 3 },
  { widgetId: "gross-sales", x: 6, y: 0, w: 6, h: 3 },
  { widgetId: "completion-rate", x: 0, y: 3, w: 6, h: 3 },
  { widgetId: "quiz-scores", x: 6, y: 3, w: 6, h: 3 },
];
