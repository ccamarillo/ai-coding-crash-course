import type { MetricResult } from "~/services/instructorAnalyticsService";
import type { WidgetDefinition } from "./registry";

// Large enough to fit a breakdown under the headline.
function showsBreakdown(size: { w: number; h: number }) {
  return size.w >= 6 || size.h >= 3;
}

export const enrollmentsWidget: WidgetDefinition<MetricResult> = {
  id: "enrollments",
  title: "New enrollments",
  description:
    "Students who enrolled in your courses, including free and coupon enrollments.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 4 },
  Tile: ({ data, size, rangeLabel }) => (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <p className="text-3xl font-bold">{data.total.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">
          {data.total === 1 ? "enrollment" : "enrollments"} ·{" "}
          {rangeLabel.toLowerCase()}
        </p>
      </div>
      {showsBreakdown(size) && data.byCourse.length > 0 && (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-sm">
          {data.byCourse.map((course) => (
            <li key={course.courseId} className="flex justify-between gap-4">
              <span className="truncate">{course.title}</span>
              <span className="font-medium tabular-nums">
                {course.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  ),
};
