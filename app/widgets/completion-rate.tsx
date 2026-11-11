import {
  getDashboardRangeLabel,
  isShortDashboardRange,
} from "~/lib/dashboard-range";
import { formatPercent } from "~/lib/utils";
import type { CompletionRateResult } from "~/services/instructorAnalyticsService";
import type { WidgetDefinition } from "./registry";
import { StatTile } from "./stat-tile";

export const completionRateWidget: WidgetDefinition<CompletionRateResult> = {
  id: "completion-rate",
  title: "Completion rate",
  description:
    "Of the enrollments that started in the range, the share that are now complete.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 4 },
  Tile: ({ data, size, range }) => {
    const startedIn = `started ${getDashboardRangeLabel(range).toLowerCase()}`;
    const footnote = isShortDashboardRange(range)
      ? "Short ranges read low: recent students haven't had time to finish."
      : undefined;

    if (data.rate === null) {
      return (
        <StatTile
          headline="—"
          caption={`no enrollments ${startedIn}`}
          size={size}
          breakdown={[]}
          footnote={footnote}
        />
      );
    }

    return (
      <StatTile
        headline={formatPercent(data.rate)}
        caption={`completed · enrollments ${startedIn}`}
        size={size}
        details={`${data.completed} of ${data.enrolled} ${data.enrolled === 1 ? "enrollment" : "enrollments"} complete`}
        breakdown={data.byCourse.map((course) => ({
          key: course.courseId,
          label: course.title,
          value: `${course.rate === null ? "—" : formatPercent(course.rate)} · ${course.completed}/${course.enrolled}`,
        }))}
        footnote={footnote}
      />
    );
  },
};
