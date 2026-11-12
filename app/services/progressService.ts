import { eq, and, or, sql, desc, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import {
  lessonProgress,
  lessons,
  modules,
  courses,
  enrollments,
  LessonProgressStatus,
} from "~/db/schema";

// ─── Progress Service ───
// Handles lesson completion tracking and course progress calculation.
// Uses positional parameters (project convention).

export function getLessonProgress(userId: number, lessonId: number) {
  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .get();
}

export function getLessonProgressForCourse(userId: number, courseId: number) {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id)))!)
    .all();

  if (courseLessons.length === 0) return [];

  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        or(...courseLessons.map((l) => eq(lessonProgress.lessonId, l.id)))!
      )
    )
    .all();
}

export function markLessonComplete(userId: number, lessonId: number) {
  const existing = getLessonProgress(userId, lessonId);

  if (existing) {
    // Only the first completion counts: re-completing keeps the original
    // completedAt so the lesson's Study day never moves.
    return db
      .update(lessonProgress)
      .set({
        status: LessonProgressStatus.Completed,
        completedAt: existing.completedAt ?? new Date().toISOString(),
      })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.Completed,
      completedAt: new Date().toISOString(),
    })
    .returning()
    .get();
}

export function markLessonInProgress(userId: number, lessonId: number) {
  const existing = getLessonProgress(userId, lessonId);

  if (existing) {
    if (existing.status === LessonProgressStatus.Completed) {
      return existing;
    }
    return db
      .update(lessonProgress)
      .set({ status: LessonProgressStatus.InProgress })
      .where(eq(lessonProgress.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      status: LessonProgressStatus.InProgress,
    })
    .returning()
    .get();
}

export function resetLessonProgress(userId: number, lessonId: number) {
  return db
    .delete(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId)
      )
    )
    .returning()
    .get();
}

function getCourseLessonIds(courseId: number): number[] {
  const courseModules = db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = db
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id)))!)
    .all();

  return courseLessons.map((l) => l.id);
}

export function calculateProgress(
  userId: number,
  courseId: number,
  includeQuizzes: boolean,
  weightByDuration: boolean
) {
  const lessonIds = getCourseLessonIds(courseId);

  if (lessonIds.length === 0) return 0;

  if (weightByDuration) {
    const courseLessons = db
      .select({
        id: lessons.id,
        durationMinutes: lessons.durationMinutes,
      })
      .from(lessons)
      .where(or(...lessonIds.map((id) => eq(lessons.id, id)))!)
      .all();

    const totalDuration = courseLessons.reduce(
      (sum, l) => sum + (l.durationMinutes ?? 1),
      0
    );

    if (totalDuration === 0) return 0;

    const completed = db
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, LessonProgressStatus.Completed),
          or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
        )
      )
      .all();

    const completedIds = new Set(completed.map((p) => p.lessonId));

    const completedDuration = courseLessons
      .filter((l) => completedIds.has(l.id))
      .reduce((sum, l) => sum + (l.durationMinutes ?? 1), 0);

    return Math.round((completedDuration / totalDuration) * 100);
  }

  const completedCount = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
      )
    )
    .get();

  return Math.round(((completedCount?.count ?? 0) / lessonIds.length) * 100);
}

export function getCompletedLessonCount(userId: number, courseId: number) {
  const lessonIds = getCourseLessonIds(courseId);
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
      )
    )
    .get();

  return result?.count ?? 0;
}

export function getTotalLessonCount(courseId: number) {
  return getCourseLessonIds(courseId).length;
}

export function isLessonCompleted(userId: number, lessonId: number) {
  const progress = getLessonProgress(userId, lessonId);
  return progress?.status === LessonProgressStatus.Completed;
}

export function getNextIncompleteLesson(userId: number, courseId: number) {
  const courseModules = db
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position)
    .all();

  if (courseModules.length === 0) return null;

  for (const mod of courseModules) {
    const moduleLessons = db
      .select()
      .from(lessons)
      .where(eq(lessons.moduleId, mod.id))
      .orderBy(lessons.position)
      .all();

    for (const lesson of moduleLessons) {
      const progress = getLessonProgress(userId, lesson.id);
      if (!progress || progress.status !== LessonProgressStatus.Completed) {
        return lesson;
      }
    }
  }

  return null;
}

export function getRecentlyProgressedCourses(
  userId: number,
  limit: number = 3
) {
  return db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      coverImageUrl: courses.coverImageUrl,
      lastActivityId: sql<number>`max(${lessonProgress.id})`,
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessonProgress.userId, userId))
    .groupBy(courses.id)
    .orderBy(desc(sql`max(${lessonProgress.id})`))
    .limit(limit)
    .all();
}

// ─── Streaks ───
// A Study day is a calendar day, in the user's time zone, with at least one first lesson
// completion. A Streak is a run of consecutive Study days. Days are bucketed in JS so the
// (untrusted) time zone never reaches SQL.

export type StreakState = "today" | "at-risk" | "broken" | "empty";

export type Streak = {
  current: number;
  longest: number;
  state: StreakState;
};

const DAY_MS = 86_400_000;

// Keyed by resolved zone IDs, so the map stays bounded.
const localDayFormatters = new Map<string, Intl.DateTimeFormat>();

function localDayFormatter(timeZone: string) {
  let formatter = localDayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    localDayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

// UTC instant → epoch day number of its local calendar date in timeZone.
// Throws RangeError on an unparseable instant.
function toLocalEpochDay(instant: Date, timeZone: string): number {
  const parts = localDayFormatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS;
}

/**
 * `timeZone` must already be resolved (see `resolveTimeZone`). Days are compared as
 * epoch day numbers, never as now − 24h, so DST change days don't shift "yesterday".
 */
export function getStreak(userId: number, timeZone: string, now: Date): Streak {
  const rows = db
    .select({ completedAt: lessonProgress.completedAt })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        isNotNull(lessonProgress.completedAt)
      )
    )
    .all();

  if (rows.length === 0) return { current: 0, longest: 0, state: "empty" };

  const studyDays = [
    ...new Set(rows.map((r) => toLocalEpochDay(new Date(r.completedAt!), timeZone))),
  ].sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  for (let i = 0; i < studyDays.length; i++) {
    run = i > 0 && studyDays[i] - studyDays[i - 1] === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // `run` is now the Streak ending on the latest Study day.
  const today = toLocalEpochDay(now, timeZone);
  const latest = studyDays[studyDays.length - 1];

  if (latest >= today) return { current: run, longest, state: "today" };
  if (latest === today - 1) return { current: run, longest, state: "at-risk" };
  return { current: 0, longest, state: "broken" };
}
