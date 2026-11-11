import type { MetricResult } from "~/services/instructorAnalyticsService";
import type { WidgetDefinition } from "./registry";
import { StatTile } from "./stat-tile";

export const enrollmentsWidget: WidgetDefinition<MetricResult> = {
  id: "enrollments",
  title: "New enrollments",
  description:
    "Students who enrolled in your courses, including free and coupon enrollments.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 4 },
  Tile: ({ data, size, rangeLabel }) => (
    <StatTile
      headline={data.total.toLocaleString()}
      caption={`${data.total === 1 ? "enrollment" : "enrollments"} · ${rangeLabel.toLowerCase()}`}
      size={size}
      breakdown={data.byCourse.map((course) => ({
        key: course.courseId,
        label: course.title,
        value: course.value.toLocaleString(),
      }))}
    />
  ),
};
