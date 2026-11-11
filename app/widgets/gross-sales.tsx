import { formatDollars } from "~/lib/utils";
import type { MetricResult } from "~/services/instructorAnalyticsService";
import type { WidgetDefinition } from "./registry";
import { StatTile } from "./stat-tile";

export const grossSalesWidget: WidgetDefinition<MetricResult> = {
  id: "gross-sales",
  title: "Gross sales",
  description:
    "What students paid for your courses after regional discounts, before platform fees.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 4 },
  Tile: ({ data, size, rangeLabel }) => (
    <StatTile
      headline={formatDollars(data.total)}
      caption={`gross sales · ${rangeLabel.toLowerCase()}`}
      size={size}
      breakdown={data.byCourse.map((course) => ({
        key: course.courseId,
        label: course.title,
        value: formatDollars(course.value),
      }))}
    />
  ),
};
