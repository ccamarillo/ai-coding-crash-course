import { formatPercent } from "~/lib/utils";
import type { QuizScoresResult } from "~/services/instructorAnalyticsService";
import { getDashboardRangeLabel } from "~/lib/dashboard-range";
import type { WidgetDefinition } from "./registry";
import { StatTile } from "./stat-tile";

export const quizScoresWidget: WidgetDefinition<QuizScoresResult> = {
  id: "quiz-scores",
  title: "Quiz scores",
  description:
    "Average of each student's best attempt per quiz, and the share of those attempts that passed.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 4 },
  Tile: ({ data, size, range }) =>
    data.averageScore === null ? (
      <StatTile
        headline="—"
        caption={`no quiz attempts · ${getDashboardRangeLabel(range).toLowerCase()}`}
        size={size}
        breakdown={[]}
      />
    ) : (
      <StatTile
        headline={formatPercent(data.averageScore)}
        caption={`average best score · ${formatPercent(data.passRate)} passed · ${getDashboardRangeLabel(range).toLowerCase()}`}
        size={size}
        breakdown={data.byCourse.map((course) => ({
          key: course.courseId,
          label: course.title,
          value:
            course.averageScore === null
              ? "—"
              : `${formatPercent(course.averageScore)} · ${formatPercent(course.passRate)} passed`,
        }))}
      />
    ),
};
