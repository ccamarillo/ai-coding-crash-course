import type { QuizScoresResult } from "~/services/instructorAnalyticsService";
import type { WidgetDefinition } from "./registry";
import { StatTile } from "./stat-tile";

function formatPercent(fraction: number) {
  return `${Math.round(fraction * 100)}%`;
}

export const quizScoresWidget: WidgetDefinition<QuizScoresResult> = {
  id: "quiz-scores",
  title: "Quiz scores",
  description:
    "Average of each student's best attempt per quiz, and the share of those attempts that passed.",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 3, h: 2 },
  maxSize: { w: 12, h: 4 },
  Tile: ({ data, size, rangeLabel }) =>
    data.averageScore === null ? (
      <StatTile
        headline="—"
        caption={`no quiz attempts · ${rangeLabel.toLowerCase()}`}
        size={size}
        breakdown={[]}
      />
    ) : (
      <StatTile
        headline={formatPercent(data.averageScore)}
        caption={`average best score · ${formatPercent(data.passRate)} passed · ${rangeLabel.toLowerCase()}`}
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
