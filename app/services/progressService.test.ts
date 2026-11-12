import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
  resetLessonProgress,
  calculateProgress,
  getCompletedLessonCount,
  getTotalLessonCount,
  isLessonCompleted,
  getNextIncompleteLesson,
  getStreak,
} from "./progressService";

// Helper to create a module with lessons in the test db
function createModuleWithLessons(
  courseId: number,
  moduleTitle: string,
  position: number,
  lessonCount: number,
  durationMinutes?: number
) {
  const mod = testDb
    .insert(schema.modules)
    .values({
      courseId,
      title: moduleTitle,
      position,
    })
    .returning()
    .get();

  const createdLessons = [];
  for (let i = 0; i < lessonCount; i++) {
    const lesson = testDb
      .insert(schema.lessons)
      .values({
        moduleId: mod.id,
        title: `Lesson ${i + 1}`,
        position: i + 1,
        durationMinutes: durationMinutes ?? null,
      })
      .returning()
      .get();
    createdLessons.push(lesson);
  }

  return { module: mod, lessons: createdLessons };
}

describe("progressService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("markLessonComplete", () => {
    const now = new Date("2026-11-12T09:30:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("marks a lesson as completed with a new progress record", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      const progress = markLessonComplete(base.user.id, lessons[0].id);

      expect(progress).toBeDefined();
      expect(progress.userId).toBe(base.user.id);
      expect(progress.lessonId).toBe(lessons[0].id);
      expect(progress.status).toBe(schema.LessonProgressStatus.Completed);
      expect(progress.completedAt).toBe(now.toISOString());
    });

    it("updates an existing in-progress record to completed, stamped with now", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      markLessonInProgress(base.user.id, lessons[0].id);
      const progress = markLessonComplete(base.user.id, lessons[0].id);

      expect(progress.status).toBe(schema.LessonProgressStatus.Completed);
      expect(progress.completedAt).toBe(now.toISOString());
    });

    it("keeps the original completedAt when completing an already completed lesson", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);
      const firstCompletedAt = "2026-11-01T18:00:00.000Z";
      testDb
        .insert(schema.lessonProgress)
        .values({
          userId: base.user.id,
          lessonId: lessons[0].id,
          status: schema.LessonProgressStatus.Completed,
          completedAt: firstCompletedAt,
        })
        .run();

      const progress = markLessonComplete(base.user.id, lessons[0].id);

      expect(progress.status).toBe(schema.LessonProgressStatus.Completed);
      expect(progress.completedAt).toBe(firstCompletedAt);
      expect(getLessonProgress(base.user.id, lessons[0].id)?.completedAt).toBe(
        firstCompletedAt
      );
    });
  });

  describe("markLessonInProgress", () => {
    it("marks a lesson as in-progress with a new progress record", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      const progress = markLessonInProgress(base.user.id, lessons[0].id);

      expect(progress.status).toBe(schema.LessonProgressStatus.InProgress);
      expect(progress.completedAt).toBeNull();
    });

    it("does not downgrade a completed lesson back to in-progress", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      markLessonComplete(base.user.id, lessons[0].id);
      const progress = markLessonInProgress(base.user.id, lessons[0].id);

      expect(progress.status).toBe(schema.LessonProgressStatus.Completed);
    });

    it("updates an existing not-started record to in-progress", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      // Create initial in-progress, then mark in-progress again (no-op for in_progress)
      const first = markLessonInProgress(base.user.id, lessons[0].id);
      const second = markLessonInProgress(base.user.id, lessons[0].id);

      expect(second.status).toBe(schema.LessonProgressStatus.InProgress);
      expect(second.id).toBe(first.id);
    });
  });

  describe("getLessonProgress", () => {
    it("returns the progress record for a user/lesson pair", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      markLessonComplete(base.user.id, lessons[0].id);

      const progress = getLessonProgress(base.user.id, lessons[0].id);
      expect(progress).toBeDefined();
      expect(progress!.status).toBe(schema.LessonProgressStatus.Completed);
    });

    it("returns undefined when no progress exists", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      const progress = getLessonProgress(base.user.id, lessons[0].id);
      expect(progress).toBeUndefined();
    });
  });

  describe("getLessonProgressForCourse", () => {
    it("returns all lesson progress records for a user in a course", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      markLessonComplete(base.user.id, lessons[0].id);
      markLessonInProgress(base.user.id, lessons[1].id);

      const progress = getLessonProgressForCourse(base.user.id, base.course.id);
      expect(progress).toHaveLength(2);
    });

    it("returns empty array for a course with no modules", () => {
      // Use a second course with no modules
      const emptyCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Empty Course",
          slug: "empty-course",
          description: "No modules",
          salesCopy: "Sales copy.",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const progress = getLessonProgressForCourse(base.user.id, emptyCourse.id);
      expect(progress).toHaveLength(0);
    });

    it("returns empty array when user has no progress", () => {
      createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      const progress = getLessonProgressForCourse(base.user.id, base.course.id);
      expect(progress).toHaveLength(0);
    });
  });

  describe("resetLessonProgress", () => {
    it("deletes the progress record for a user/lesson pair", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      markLessonComplete(base.user.id, lessons[0].id);
      const deleted = resetLessonProgress(base.user.id, lessons[0].id);

      expect(deleted).toBeDefined();
      expect(getLessonProgress(base.user.id, lessons[0].id)).toBeUndefined();
    });

    it("returns undefined when no progress exists to reset", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      const deleted = resetLessonProgress(base.user.id, lessons[0].id);
      expect(deleted).toBeUndefined();
    });
  });

  describe("isLessonCompleted", () => {
    it("returns true when lesson is completed", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      markLessonComplete(base.user.id, lessons[0].id);

      expect(isLessonCompleted(base.user.id, lessons[0].id)).toBe(true);
    });

    it("returns false when lesson is in-progress", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      markLessonInProgress(base.user.id, lessons[0].id);

      expect(isLessonCompleted(base.user.id, lessons[0].id)).toBe(false);
    });

    it("returns false when no progress exists", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);

      expect(isLessonCompleted(base.user.id, lessons[0].id)).toBe(false);
    });
  });

  describe("calculateProgress", () => {
    it("returns 0 for a course with no lessons", () => {
      const emptyCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Empty Course",
          slug: "empty-course",
          description: "No content",
          salesCopy: "Sales copy.",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const progress = calculateProgress(base.user.id, emptyCourse.id, false, false);
      expect(progress).toBe(0);
    });

    it("returns 0 when no lessons are completed", () => {
      createModuleWithLessons(base.course.id, "Module 1", 1, 4);

      const progress = calculateProgress(base.user.id, base.course.id, false, false);
      expect(progress).toBe(0);
    });

    it("returns 100 when all lessons are completed", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      for (const lesson of lessons) {
        markLessonComplete(base.user.id, lesson.id);
      }

      const progress = calculateProgress(base.user.id, base.course.id, false, false);
      expect(progress).toBe(100);
    });

    it("calculates correct percentage for partial completion", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 4);

      markLessonComplete(base.user.id, lessons[0].id);
      markLessonComplete(base.user.id, lessons[1].id);

      const progress = calculateProgress(base.user.id, base.course.id, false, false);
      expect(progress).toBe(50); // 2/4 = 50%
    });

    it("only counts completed lessons, not in-progress ones", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 4);

      markLessonComplete(base.user.id, lessons[0].id);
      markLessonInProgress(base.user.id, lessons[1].id);

      const progress = calculateProgress(base.user.id, base.course.id, false, false);
      expect(progress).toBe(25); // 1/4 = 25%
    });

    it("calculates progress across multiple modules", () => {
      const m1 = createModuleWithLessons(base.course.id, "Module 1", 1, 2);
      const m2 = createModuleWithLessons(base.course.id, "Module 2", 2, 2);

      markLessonComplete(base.user.id, m1.lessons[0].id);
      markLessonComplete(base.user.id, m2.lessons[0].id);

      const progress = calculateProgress(base.user.id, base.course.id, false, false);
      expect(progress).toBe(50); // 2/4 = 50%
    });

    it("rounds progress to nearest integer", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      markLessonComplete(base.user.id, lessons[0].id);

      const progress = calculateProgress(base.user.id, base.course.id, false, false);
      expect(progress).toBe(33); // 1/3 = 33.33... → 33
    });
  });

  describe("calculateProgress — weight by duration", () => {
    it("weights progress by lesson duration", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      const lesson1 = testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Short Lesson", position: 1, durationMinutes: 10 })
        .returning()
        .get();

      const lesson2 = testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Long Lesson", position: 2, durationMinutes: 30 })
        .returning()
        .get();

      // Complete only the short lesson (10 out of 40 total minutes)
      markLessonComplete(base.user.id, lesson1.id);

      const progress = calculateProgress(base.user.id, base.course.id, false, true);
      expect(progress).toBe(25); // 10/40 = 25%
    });

    it("uses duration 1 as fallback for lessons with null duration", () => {
      const mod = testDb
        .insert(schema.modules)
        .values({ courseId: base.course.id, title: "Module 1", position: 1 })
        .returning()
        .get();

      const lesson1 = testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "Timed Lesson", position: 1, durationMinutes: 9 })
        .returning()
        .get();

      testDb
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: "No Duration", position: 2 })
        .returning()
        .get();

      // Complete only the timed lesson (9 out of 10 total minutes)
      markLessonComplete(base.user.id, lesson1.id);

      const progress = calculateProgress(base.user.id, base.course.id, false, true);
      expect(progress).toBe(90); // 9/10 = 90%
    });

    it("returns 0 for empty course with weight by duration", () => {
      const emptyCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Empty",
          slug: "empty",
          description: "Empty",
          salesCopy: "Sales copy.",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const progress = calculateProgress(base.user.id, emptyCourse.id, false, true);
      expect(progress).toBe(0);
    });
  });

  describe("getCompletedLessonCount", () => {
    it("returns count of completed lessons in a course", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      markLessonComplete(base.user.id, lessons[0].id);
      markLessonComplete(base.user.id, lessons[1].id);

      expect(getCompletedLessonCount(base.user.id, base.course.id)).toBe(2);
    });

    it("does not count in-progress lessons", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      markLessonComplete(base.user.id, lessons[0].id);
      markLessonInProgress(base.user.id, lessons[1].id);

      expect(getCompletedLessonCount(base.user.id, base.course.id)).toBe(1);
    });

    it("returns 0 when no lessons are completed", () => {
      createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      expect(getCompletedLessonCount(base.user.id, base.course.id)).toBe(0);
    });

    it("returns 0 for a course with no lessons", () => {
      expect(getCompletedLessonCount(base.user.id, base.course.id)).toBe(0);
    });
  });

  describe("getTotalLessonCount", () => {
    it("returns total number of lessons in a course", () => {
      createModuleWithLessons(base.course.id, "Module 1", 1, 3);
      createModuleWithLessons(base.course.id, "Module 2", 2, 2);

      expect(getTotalLessonCount(base.course.id)).toBe(5);
    });

    it("returns 0 for a course with no lessons", () => {
      expect(getTotalLessonCount(base.course.id)).toBe(0);
    });
  });

  describe("getNextIncompleteLesson", () => {
    it("returns the first lesson when no progress exists", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      const next = getNextIncompleteLesson(base.user.id, base.course.id);
      expect(next).toBeDefined();
      expect(next!.id).toBe(lessons[0].id);
    });

    it("returns the first incomplete lesson after completed ones", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      markLessonComplete(base.user.id, lessons[0].id);

      const next = getNextIncompleteLesson(base.user.id, base.course.id);
      expect(next).toBeDefined();
      expect(next!.id).toBe(lessons[1].id);
    });

    it("crosses module boundaries to find the next incomplete lesson", () => {
      const m1 = createModuleWithLessons(base.course.id, "Module 1", 1, 2);
      const m2 = createModuleWithLessons(base.course.id, "Module 2", 2, 2);

      // Complete all lessons in module 1
      markLessonComplete(base.user.id, m1.lessons[0].id);
      markLessonComplete(base.user.id, m1.lessons[1].id);

      const next = getNextIncompleteLesson(base.user.id, base.course.id);
      expect(next).toBeDefined();
      expect(next!.id).toBe(m2.lessons[0].id);
    });

    it("returns null when all lessons are completed", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 2);

      for (const lesson of lessons) {
        markLessonComplete(base.user.id, lesson.id);
      }

      const next = getNextIncompleteLesson(base.user.id, base.course.id);
      expect(next).toBeNull();
    });

    it("returns null for a course with no modules", () => {
      const next = getNextIncompleteLesson(base.user.id, base.course.id);
      expect(next).toBeNull();
    });

    it("treats in-progress lessons as incomplete", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 3);

      markLessonInProgress(base.user.id, lessons[0].id);

      const next = getNextIncompleteLesson(base.user.id, base.course.id);
      expect(next).toBeDefined();
      expect(next!.id).toBe(lessons[0].id);
    });
  });

  describe("getStreak", () => {
    // Inserts one completed lesson progress row per instant.
    function completeAt(...instants: string[]) {
      const { lessons } = createModuleWithLessons(
        base.course.id,
        "Streak Module",
        1,
        instants.length
      );
      instants.forEach((completedAt, i) => {
        testDb
          .insert(schema.lessonProgress)
          .values({
            userId: base.user.id,
            lessonId: lessons[i].id,
            status: schema.LessonProgressStatus.Completed,
            completedAt,
          })
          .run();
      });
    }

    const now = new Date("2026-11-12T15:00:00.000Z");

    it("is empty when the user has no completions", () => {
      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 0,
        longest: 0,
        state: "empty",
      });
    });

    it("ignores in-progress lessons and other users' completions", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 2);
      markLessonInProgress(base.user.id, lessons[0].id);
      testDb
        .insert(schema.lessonProgress)
        .values({
          userId: base.instructor.id,
          lessonId: lessons[1].id,
          status: schema.LessonProgressStatus.Completed,
          completedAt: "2026-11-12T10:00:00.000Z",
        })
        .run();

      expect(getStreak(base.user.id, "UTC", now).state).toBe("empty");
    });

    it("counts consecutive Study days ending today", () => {
      completeAt(
        "2026-11-10T09:00:00.000Z",
        "2026-11-11T09:00:00.000Z",
        "2026-11-12T09:00:00.000Z"
      );

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 3,
        longest: 3,
        state: "today",
      });
    });

    it("counts several completions on one day once", () => {
      completeAt(
        "2026-11-11T01:00:00.000Z",
        "2026-11-11T12:00:00.000Z",
        "2026-11-11T23:59:59.000Z",
        "2026-11-12T08:00:00.000Z",
        "2026-11-12T09:00:00.000Z"
      );

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 2,
        longest: 2,
        state: "today",
      });
    });

    it("keeps a Streak ending yesterday alive and marks it at-risk", () => {
      completeAt("2026-11-10T09:00:00.000Z", "2026-11-11T09:00:00.000Z");

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 2,
        longest: 2,
        state: "at-risk",
      });
    });

    it("breaks the Streak when neither today nor yesterday is a Study day", () => {
      completeAt("2026-11-09T09:00:00.000Z", "2026-11-10T09:00:00.000Z");

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 0,
        longest: 2,
        state: "broken",
      });
    });

    it("ignores completions dated after today", () => {
      completeAt("2026-11-11T09:00:00.000Z", "2026-11-13T09:00:00.000Z");

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 1,
        longest: 1,
        state: "at-risk",
      });
    });

    it("reports the longest Streak separately from the current one", () => {
      completeAt(
        "2026-10-01T09:00:00.000Z",
        "2026-10-02T09:00:00.000Z",
        "2026-10-03T09:00:00.000Z",
        "2026-10-04T09:00:00.000Z",
        "2026-11-11T09:00:00.000Z",
        "2026-11-12T09:00:00.000Z"
      );

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 2,
        longest: 4,
        state: "today",
      });
    });

    it("starts a new Streak after a one-day gap", () => {
      completeAt(
        "2026-11-08T09:00:00.000Z",
        "2026-11-09T09:00:00.000Z",
        "2026-11-11T09:00:00.000Z",
        "2026-11-12T09:00:00.000Z"
      );

      expect(getStreak(base.user.id, "UTC", now)).toMatchObject({
        current: 2,
        longest: 2,
      });
    });

    it("buckets completions into the user's local days", () => {
      // 2026-11-12T03:00Z is still 2026-11-11 in New York (22:00 EST).
      completeAt("2026-11-12T03:00:00.000Z");

      expect(getStreak(base.user.id, "UTC", now)).toMatchObject({
        current: 1,
        state: "today",
      });
      expect(getStreak(base.user.id, "America/New_York", now)).toMatchObject({
        current: 1,
        state: "at-risk",
      });
    });

    it("buckets completions with half-hour offsets (Asia/Kolkata)", () => {
      // 2026-11-11T19:00Z is 2026-11-12 00:30 IST.
      completeAt("2026-11-11T19:00:00.000Z");
      const kolkataNow = new Date("2026-11-12T05:00:00.000Z");

      expect(getStreak(base.user.id, "UTC", kolkataNow).state).toBe("at-risk");
      expect(getStreak(base.user.id, "Asia/Kolkata", kolkataNow).state).toBe("today");
    });

    it("finds yesterday correctly on the New York spring-forward day", () => {
      // 2026-03-08 is 23 hours long in New York; now is 2026-03-09 00:30 EDT.
      completeAt("2026-03-08T05:30:00.000Z"); // 2026-03-08 00:30 EST
      const springNow = new Date("2026-03-09T04:30:00.000Z");

      expect(getStreak(base.user.id, "America/New_York", springNow)).toEqual({
        current: 1,
        longest: 1,
        state: "at-risk",
      });
    });

    it("finds yesterday correctly on the New York fall-back day", () => {
      // 2026-11-01 is 25 hours long in New York; now is 2026-11-01 23:30 EST,
      // where now − 24h would still land on 2026-11-01.
      completeAt("2026-10-31T15:00:00.000Z"); // 2026-10-31 11:00 EDT
      const fallNow = new Date("2026-11-02T04:30:00.000Z");

      expect(getStreak(base.user.id, "America/New_York", fallNow)).toEqual({
        current: 1,
        longest: 1,
        state: "at-risk",
      });
    });

    it("throws on an unparseable completedAt", () => {
      completeAt("not a date");

      expect(() => getStreak(base.user.id, "UTC", now)).toThrow();
    });

    it("counts only the first completion of a lesson", () => {
      const { lessons } = createModuleWithLessons(base.course.id, "Module 1", 1, 1);
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2026-11-09T09:00:00.000Z"));
        markLessonComplete(base.user.id, lessons[0].id);
        vi.setSystemTime(new Date("2026-11-12T09:00:00.000Z"));
        markLessonComplete(base.user.id, lessons[0].id);
      } finally {
        vi.useRealTimers();
      }

      expect(getStreak(base.user.id, "UTC", now)).toEqual({
        current: 0,
        longest: 1,
        state: "broken",
      });
    });
  });
});
