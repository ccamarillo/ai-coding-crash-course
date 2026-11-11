import type { DashboardRange } from "~/lib/dashboard-range";
import {
  getCompletionRate,
  getGrossSales,
  getNewEnrollments,
  getQuizScores,
} from "~/services/instructorAnalyticsService";
import type { WidgetData, WidgetId } from "./registry";

type WidgetDataFunction<K extends WidgetId> = (
  instructorId: number,
  range: DashboardRange,
  courseId: number | null
) => WidgetData<K>;

export const widgetDataFunctions: { [K in WidgetId]: WidgetDataFunction<K> } = {
  enrollments: getNewEnrollments,
  "gross-sales": getGrossSales,
  "completion-rate": getCompletionRate,
  "quiz-scores": getQuizScores,
};

/**
 * Starts a widget's data function without awaiting it. A throwing data
 * function becomes a rejected promise, so it fails only its own tile.
 */
export function loadWidgetData(
  widgetId: WidgetId,
  instructorId: number,
  range: DashboardRange,
  courseId: number | null
) {
  const promise = Promise.resolve().then(() =>
    widgetDataFunctions[widgetId](instructorId, range, courseId)
  );

  // The rejection can settle before React Router subscribes while streaming,
  // which Node treats as unhandled and crashes on. Log it here instead; the
  // original promise still rejects into the tile's error state.
  promise.catch((error) =>
    console.error(`Widget "${widgetId}" failed to load`, error)
  );

  return promise;
}
