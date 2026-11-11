import { and, desc, eq, gte, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "~/db";
import {
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
  quizAttempts,
  quizzes,
} from "~/db/schema";
import {
  getDashboardRangeStart,
  type DashboardRange,
} from "~/lib/dashboard-range";

// ─── Instructor Analytics Service ───
// Metrics for the instructor dashboard widgets. Every metric is limited to the
// instructor's own courses, then to the selected course when one is given.
// Uses positional parameters (project convention).

export type CourseMetric = { courseId: number; title: string; value: number };

export type MetricResult = { total: number; byCourse: CourseMetric[] };

/**
 * Summary of best attempts, one per (student, quiz) pair. Scores are 0–1
 * fractions, and both are null when there are no attempts.
 */
export type QuizScoreSummary =
  | { bestAttempts: number; averageScore: number; passRate: number }
  | { bestAttempts: 0; averageScore: null; passRate: null };

/**
 * Of the (student, course) enrollments started in the range, how many are now
 * complete. The rate is a 0–1 fraction, null when nothing started in range.
 */
export type CompletionSummary =
  | { enrolled: number; completed: number; rate: number }
  | { enrolled: 0; completed: 0; rate: null };

/** A summary plus the same summary for each course in scope. */
type WithCourseBreakdown<TSummary> = TSummary & {
  byCourse: (TSummary & { courseId: number; title: string })[];
};

export type CompletionRateResult = WithCourseBreakdown<CompletionSummary>;

export type QuizScoresResult = WithCourseBreakdown<QuizScoreSummary>;

/** Rows whose timestamp column falls in the range; no condition for "all". */
function inRange(column: SQLWrapper, range: DashboardRange) {
  const since = getDashboardRangeStart(range, new Date());
  return since === null ? undefined : gte(column, since);
}

function courseScope(instructorId: number, courseId: number | null) {
  return and(
    eq(courses.instructorId, instructorId),
    courseId === null ? undefined : eq(courses.id, courseId)
  );
}

/**
 * The course id to filter by, accepted only when the instructor owns it.
 * Anything else falls back to all courses (null).
 */
export function resolveCourseFilter(
  instructorId: number,
  value: string | null
) {
  const courseId = Number(value);
  if (!value || !Number.isInteger(courseId)) return null;

  const course = db
    .select({ id: courses.id })
    .from(courses)
    .where(courseScope(instructorId, courseId))
    .get();

  return course?.id ?? null;
}

/**
 * Distinct (student, course) enrollment pairs whose enrollment date falls in
 * the range. Free and coupon enrollments are included. Pairs are counted
 * because the enrollments table allows duplicate rows.
 */
export function getNewEnrollments(
  instructorId: number,
  range: DashboardRange,
  courseId: number | null
): MetricResult {
  const count = sql<number>`count(distinct ${enrollments.userId})`;

  const byCourse = db
    .select({
      courseId: courses.id,
      title: courses.title,
      value: count,
    })
    .from(courses)
    .leftJoin(
      enrollments,
      and(
        eq(enrollments.courseId, courses.id),
        inRange(enrollments.enrolledAt, range)
      )
    )
    .where(courseScope(instructorId, courseId))
    .groupBy(courses.id)
    .orderBy(desc(count), courses.title)
    .all();

  return { total: sumValues(byCourse), byCourse };
}

/**
 * Amount paid (integer cents, USD, after the regional discount) for purchases
 * made in the range. A team purchase is one row and counts in full; coupon
 * and free enrollments have no purchase row, so they contribute nothing.
 */
export function getGrossSales(
  instructorId: number,
  range: DashboardRange,
  courseId: number | null
): MetricResult {
  const amount = sql<number>`coalesce(sum(${purchases.amountPaid}), 0)`;

  const byCourse = db
    .select({
      courseId: courses.id,
      title: courses.title,
      value: amount,
    })
    .from(courses)
    .leftJoin(
      purchases,
      and(
        eq(purchases.courseId, courses.id),
        inRange(purchases.createdAt, range)
      )
    )
    .where(courseScope(instructorId, courseId))
    .groupBy(courses.id)
    .orderBy(desc(amount), courses.title)
    .all();

  return { total: sumValues(byCourse), byCourse };
}

/**
 * For each (student, quiz) pair in the instructor's courses, the best attempt
 * made in the range. Reports the average of those best scores and the share of
 * them that passed. Only courses with attempts appear in the breakdown.
 */
export function getQuizScores(
  instructorId: number,
  range: DashboardRange,
  courseId: number | null
): QuizScoresResult {
  const attempts = db
    .select({
      courseId: courses.id,
      title: courses.title,
      userId: quizAttempts.userId,
      quizId: quizAttempts.quizId,
      score: quizAttempts.score,
      passed: quizAttempts.passed,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(lessons, eq(lessons.id, quizzes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(
      and(
        courseScope(instructorId, courseId),
        inRange(quizAttempts.attemptedAt, range)
      )
    )
    // Highest score first, so the first attempt seen per pair is the best.
    .orderBy(desc(quizAttempts.score), quizAttempts.attemptedAt)
    .all();

  const bestAttempts = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const key = `${attempt.userId}:${attempt.quizId}`;
    if (!bestAttempts.has(key)) bestAttempts.set(key, attempt);
  }

  const byCourseId = new Map<number, (typeof attempts)[number][]>();
  for (const attempt of bestAttempts.values()) {
    const courseAttempts = byCourseId.get(attempt.courseId) ?? [];
    courseAttempts.push(attempt);
    byCourseId.set(attempt.courseId, courseAttempts);
  }

  const byCourse = [...byCourseId.values()]
    .map((courseAttempts) => ({
      courseId: courseAttempts[0].courseId,
      title: courseAttempts[0].title,
      ...summarizeQuizAttempts(courseAttempts),
    }))
    .sort(
      (a, b) =>
        b.bestAttempts - a.bestAttempts || a.title.localeCompare(b.title)
    );

  return { ...summarizeQuizAttempts([...bestAttempts.values()]), byCourse };
}

function summarizeQuizAttempts(
  attempts: { score: number; passed: boolean }[]
): QuizScoreSummary {
  if (attempts.length === 0) {
    return { bestAttempts: 0, averageScore: null, passRate: null };
  }

  const totalScore = attempts.reduce((sum, a) => sum + a.score, 0);
  const passedCount = attempts.filter((a) => a.passed).length;

  return {
    bestAttempts: attempts.length,
    averageScore: totalScore / attempts.length,
    passRate: passedCount / attempts.length,
  };
}

/**
 * Among enrollments whose enrollment date falls in the range, the share that
 * now have a completion timestamp. Grouping by start date keeps the rate at or
 * below 100%. Only courses with enrollments in the range appear in the
 * breakdown.
 */
export function getCompletionRate(
  instructorId: number,
  range: DashboardRange,
  courseId: number | null
): CompletionRateResult {
  const enrolled = sql<number>`count(distinct ${enrollments.userId})`;
  const completed = sql<number>`count(distinct case when ${enrollments.completedAt} is not null then ${enrollments.userId} end)`;

  const rows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      enrolled,
      completed,
    })
    .from(courses)
    .innerJoin(enrollments, eq(enrollments.courseId, courses.id))
    .where(
      and(
        courseScope(instructorId, courseId),
        inRange(enrollments.enrolledAt, range)
      )
    )
    .groupBy(courses.id)
    .orderBy(desc(enrolled), courses.title)
    .all();

  const byCourse = rows.map((row) => ({
    courseId: row.courseId,
    title: row.title,
    ...summarizeCompletion(row.enrolled, row.completed),
  }));

  return {
    ...summarizeCompletion(
      sumOf(rows.map((row) => row.enrolled)),
      sumOf(rows.map((row) => row.completed))
    ),
    byCourse,
  };
}

function summarizeCompletion(
  enrolled: number,
  completed: number
): CompletionSummary {
  if (enrolled === 0) return { enrolled: 0, completed: 0, rate: null };
  return { enrolled, completed, rate: completed / enrolled };
}

function sumValues(byCourse: CourseMetric[]) {
  return sumOf(byCourse.map((course) => course.value));
}

function sumOf(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}
