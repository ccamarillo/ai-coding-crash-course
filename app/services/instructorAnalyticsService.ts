import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "~/db";
import { courses, enrollments } from "~/db/schema";
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
  const since = getDashboardRangeStart(range, new Date());
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
        since === null ? undefined : gte(enrollments.enrolledAt, since)
      )
    )
    .where(courseScope(instructorId, courseId))
    .groupBy(courses.id)
    .orderBy(desc(count), courses.title)
    .all();

  const total = byCourse.reduce((sum, course) => sum + course.value, 0);

  return { total, byCourse };
}
