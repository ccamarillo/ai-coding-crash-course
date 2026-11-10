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
import { createTeamPurchase } from "./purchaseService";
import { redeemCoupon } from "./couponService";
import {
  getGrossSales,
  getNewEnrollments,
  getQuizScores,
  resolveCourseFilter,
} from "./instructorAnalyticsService";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function daysBefore(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function createStudent(email: string) {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

function createCourse(slug: string, instructorId: number) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "A course",
      salesCopy: "Sales copy",
      instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function enroll(userId: number, courseId: number, enrolledAt: string) {
  testDb
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt })
    .run();
}

function purchase(
  userId: number,
  courseId: number,
  amountPaid: number,
  createdAt: string
) {
  testDb
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid, country: null, createdAt })
    .run();
}

function createQuiz(courseId: number, passingScore = 0.7) {
  const module = testDb
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson", position: 1 })
    .returning()
    .get();
  return testDb
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: "Quiz", passingScore })
    .returning()
    .get();
}

function attempt(
  userId: number,
  quizId: number,
  score: number,
  passed: boolean,
  attemptedAt: string
) {
  testDb
    .insert(schema.quizAttempts)
    .values({ userId, quizId, score, passed, attemptedAt })
    .run();
}

function createOtherInstructorCourse() {
  const otherInstructor = testDb
    .insert(schema.users)
    .values({
      name: "Other",
      email: "other@example.com",
      role: schema.UserRole.Instructor,
    })
    .returning()
    .get();
  return createCourse("other-course", otherInstructor.id);
}

describe("instructorAnalyticsService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getNewEnrollments", () => {
    it("counts only enrollments in the instructor's own courses", () => {
      const otherInstructor = testDb
        .insert(schema.users)
        .values({
          name: "Other",
          email: "other@example.com",
          role: schema.UserRole.Instructor,
        })
        .returning()
        .get();
      const otherCourse = createCourse("other-course", otherInstructor.id);
      enroll(base.user.id, base.course.id, daysBefore(1));
      enroll(base.user.id, otherCourse.id, daysBefore(1));

      const result = getNewEnrollments(base.instructor.id, "30d", null);

      expect(result.total).toBe(1);
      expect(result.byCourse).toEqual([
        { courseId: base.course.id, title: "Test Course", value: 1 },
      ]);
    });

    it("narrows to the selected course", () => {
      const secondCourse = createCourse("second-course", base.instructor.id);
      const student = createStudent("s2@example.com");
      enroll(base.user.id, base.course.id, daysBefore(1));
      enroll(base.user.id, secondCourse.id, daysBefore(1));
      enroll(student.id, secondCourse.id, daysBefore(1));

      const result = getNewEnrollments(
        base.instructor.id,
        "30d",
        secondCourse.id
      );

      expect(result.total).toBe(2);
      expect(result.byCourse).toEqual([
        { courseId: secondCourse.id, title: "second-course", value: 2 },
      ]);
    });

    it("includes an enrollment exactly at the start of the range and excludes one just before", () => {
      const student = createStudent("s2@example.com");
      // NOW is 2026-06-15T12:00Z, so 7 days starts at 2026-06-08T12:00Z.
      enroll(base.user.id, base.course.id, "2026-06-08T12:00:00.000Z");
      enroll(student.id, base.course.id, "2026-06-08T11:59:59.999Z");

      expect(getNewEnrollments(base.instructor.id, "7d", null).total).toBe(1);
      expect(getNewEnrollments(base.instructor.id, "30d", null).total).toBe(2);
    });

    it("counts enrollments of any age for the all-time range", () => {
      const student = createStudent("s2@example.com");
      enroll(base.user.id, base.course.id, daysBefore(1));
      enroll(student.id, base.course.id, daysBefore(3 * 365));

      expect(getNewEnrollments(base.instructor.id, "1y", null).total).toBe(1);
      expect(getNewEnrollments(base.instructor.id, "all", null).total).toBe(2);
    });

    it("counts duplicate enrollment rows once, and a student in two courses once per course", () => {
      const secondCourse = createCourse("second-course", base.instructor.id);
      enroll(base.user.id, base.course.id, daysBefore(2));
      enroll(base.user.id, base.course.id, daysBefore(1));
      enroll(base.user.id, secondCourse.id, daysBefore(1));

      const result = getNewEnrollments(base.instructor.id, "30d", null);

      expect(result.total).toBe(2);
      expect(result.byCourse.map((c) => c.value)).toEqual([1, 1]);
    });

    it("returns zero for each course when there are no enrollments in the range", () => {
      enroll(base.user.id, base.course.id, daysBefore(60));

      expect(getNewEnrollments(base.instructor.id, "30d", null)).toEqual({
        total: 0,
        byCourse: [
          { courseId: base.course.id, title: "Test Course", value: 0 },
        ],
      });
    });

    it("returns an empty result for an instructor with no courses", () => {
      expect(getNewEnrollments(base.user.id, "all", null)).toEqual({
        total: 0,
        byCourse: [],
      });
    });
  });

  describe("resolveCourseFilter", () => {
    it("accepts a course the instructor owns", () => {
      expect(
        resolveCourseFilter(base.instructor.id, String(base.course.id))
      ).toBe(base.course.id);
    });

    it("falls back to all courses for another instructor's course", () => {
      expect(
        resolveCourseFilter(base.user.id, String(base.course.id))
      ).toBeNull();
    });

    it("falls back to all courses for a missing or malformed value", () => {
      expect(resolveCourseFilter(base.instructor.id, null)).toBeNull();
      expect(resolveCourseFilter(base.instructor.id, "abc")).toBeNull();
      expect(resolveCourseFilter(base.instructor.id, "9999")).toBeNull();
    });
  });

  describe("getGrossSales", () => {
    it("sums amounts paid only for the instructor's own courses", () => {
      const otherCourse = createOtherInstructorCourse();
      purchase(base.user.id, base.course.id, 4999, daysBefore(1));
      purchase(base.user.id, otherCourse.id, 9999, daysBefore(1));

      expect(getGrossSales(base.instructor.id, "30d", null)).toEqual({
        total: 4999,
        byCourse: [
          { courseId: base.course.id, title: "Test Course", value: 4999 },
        ],
      });
    });

    it("narrows to the selected course", () => {
      const secondCourse = createCourse("second-course", base.instructor.id);
      purchase(base.user.id, base.course.id, 4999, daysBefore(1));
      purchase(base.user.id, secondCourse.id, 2500, daysBefore(1));

      expect(getGrossSales(base.instructor.id, "30d", secondCourse.id)).toEqual(
        {
          total: 2500,
          byCourse: [
            { courseId: secondCourse.id, title: "second-course", value: 2500 },
          ],
        }
      );
    });

    it("counts a team purchase in full on the day it was bought, and nothing for the coupon enrollments", () => {
      const { coupons } = createTeamPurchase(
        base.user.id,
        base.course.id,
        30000,
        null,
        3
      );
      const student = createStudent("s2@example.com");
      expect(redeemCoupon(coupons[0].code, student.id, "US").ok).toBe(true);

      expect(getGrossSales(base.instructor.id, "7d", null).total).toBe(30000);
    });

    it("dates a team purchase by when it was bought, not when its coupons are redeemed", () => {
      vi.setSystemTime(new Date(daysBefore(60)));
      const { coupons } = createTeamPurchase(
        base.user.id,
        base.course.id,
        30000,
        null,
        3
      );
      vi.setSystemTime(NOW);
      const student = createStudent("s2@example.com");
      expect(redeemCoupon(coupons[0].code, student.id, "US").ok).toBe(true);

      expect(getGrossSales(base.instructor.id, "30d", null).total).toBe(0);
      expect(getGrossSales(base.instructor.id, "90d", null).total).toBe(30000);
    });

    it("counts nothing for a free enrollment", () => {
      enroll(base.user.id, base.course.id, daysBefore(1));

      expect(getGrossSales(base.instructor.id, "30d", null).total).toBe(0);
    });

    it("includes a purchase exactly at the start of the range and excludes one just before", () => {
      // NOW is 2026-06-15T12:00Z, so 7 days starts at 2026-06-08T12:00Z.
      purchase(base.user.id, base.course.id, 1000, "2026-06-08T12:00:00.000Z");
      purchase(base.user.id, base.course.id, 2000, "2026-06-08T11:59:59.999Z");

      expect(getGrossSales(base.instructor.id, "7d", null).total).toBe(1000);
      expect(getGrossSales(base.instructor.id, "30d", null).total).toBe(3000);
    });

    it("counts purchases of any age for the all-time range", () => {
      purchase(base.user.id, base.course.id, 1000, daysBefore(1));
      purchase(base.user.id, base.course.id, 2000, daysBefore(3 * 365));

      expect(getGrossSales(base.instructor.id, "1y", null).total).toBe(1000);
      expect(getGrossSales(base.instructor.id, "all", null).total).toBe(3000);
    });

    it("returns zero for each course when there are no purchases in the range", () => {
      purchase(base.user.id, base.course.id, 4999, daysBefore(60));

      expect(getGrossSales(base.instructor.id, "30d", null)).toEqual({
        total: 0,
        byCourse: [
          { courseId: base.course.id, title: "Test Course", value: 0 },
        ],
      });
    });
  });

  describe("getQuizScores", () => {
    it("averages each student's best attempt per quiz, so retries don't lower it", () => {
      const quiz = createQuiz(base.course.id);
      const student = createStudent("s2@example.com");
      attempt(base.user.id, quiz.id, 0.9, true, daysBefore(3));
      attempt(base.user.id, quiz.id, 0.4, false, daysBefore(1));
      attempt(student.id, quiz.id, 0.5, false, daysBefore(1));

      const result = getQuizScores(base.instructor.id, "30d", null);

      expect(result.averageScore).toBeCloseTo(0.7);
      expect(result.passRate).toBe(0.5);
      expect(result.bestAttempts).toBe(2);
    });

    it("computes the pass rate from best attempts, so a passing retry counts as passed", () => {
      const quiz = createQuiz(base.course.id);
      attempt(base.user.id, quiz.id, 0.5, false, daysBefore(3));
      attempt(base.user.id, quiz.id, 0.8, true, daysBefore(1));

      const result = getQuizScores(base.instructor.id, "30d", null);

      expect(result.averageScore).toBeCloseTo(0.8);
      expect(result.passRate).toBe(1);
    });

    it("counts only quizzes in the instructor's own courses", () => {
      const quiz = createQuiz(base.course.id);
      const otherQuiz = createQuiz(createOtherInstructorCourse().id);
      attempt(base.user.id, quiz.id, 0.6, false, daysBefore(1));
      attempt(base.user.id, otherQuiz.id, 1, true, daysBefore(1));

      expect(getQuizScores(base.instructor.id, "30d", null)).toEqual({
        averageScore: 0.6,
        passRate: 0,
        bestAttempts: 1,
        byCourse: [
          {
            courseId: base.course.id,
            title: "Test Course",
            averageScore: 0.6,
            passRate: 0,
            bestAttempts: 1,
          },
        ],
      });
    });

    it("narrows to the selected course and breaks down by course", () => {
      const secondCourse = createCourse("second-course", base.instructor.id);
      const quiz = createQuiz(base.course.id);
      const secondQuiz = createQuiz(secondCourse.id);
      const student = createStudent("s2@example.com");
      attempt(base.user.id, quiz.id, 0.6, false, daysBefore(1));
      attempt(base.user.id, secondQuiz.id, 1, true, daysBefore(1));
      attempt(student.id, secondQuiz.id, 0.8, true, daysBefore(1));

      const all = getQuizScores(base.instructor.id, "30d", null);
      expect(all.bestAttempts).toBe(3);
      expect(all.byCourse.map((c) => [c.title, c.bestAttempts])).toEqual([
        ["second-course", 2],
        ["Test Course", 1],
      ]);

      const filtered = getQuizScores(
        base.instructor.id,
        "30d",
        secondCourse.id
      );
      expect(filtered.averageScore).toBeCloseTo(0.9);
      expect(filtered.passRate).toBe(1);
      expect(filtered.byCourse.map((c) => c.title)).toEqual(["second-course"]);
    });

    it("ignores a better attempt made before the range", () => {
      const quiz = createQuiz(base.course.id);
      attempt(base.user.id, quiz.id, 1, true, daysBefore(60));
      attempt(base.user.id, quiz.id, 0.5, false, daysBefore(1));

      const result = getQuizScores(base.instructor.id, "30d", null);

      expect(result.averageScore).toBe(0.5);
      expect(result.passRate).toBe(0);
    });

    it("includes an attempt exactly at the start of the range and excludes one just before", () => {
      const quiz = createQuiz(base.course.id);
      const student = createStudent("s2@example.com");
      // NOW is 2026-06-15T12:00Z, so 7 days starts at 2026-06-08T12:00Z.
      attempt(base.user.id, quiz.id, 0.6, false, "2026-06-08T12:00:00.000Z");
      attempt(student.id, quiz.id, 0.8, true, "2026-06-08T11:59:59.999Z");

      expect(getQuizScores(base.instructor.id, "7d", null).bestAttempts).toBe(
        1
      );
      expect(getQuizScores(base.instructor.id, "30d", null).bestAttempts).toBe(
        2
      );
    });

    it("counts attempts of any age for the all-time range", () => {
      const quiz = createQuiz(base.course.id);
      const student = createStudent("s2@example.com");
      attempt(base.user.id, quiz.id, 0.6, false, daysBefore(1));
      attempt(student.id, quiz.id, 0.8, true, daysBefore(3 * 365));

      expect(getQuizScores(base.instructor.id, "1y", null).bestAttempts).toBe(
        1
      );
      expect(getQuizScores(base.instructor.id, "all", null).bestAttempts).toBe(
        2
      );
    });

    it("returns an empty state when there are no attempts in the range", () => {
      createQuiz(base.course.id);

      expect(getQuizScores(base.instructor.id, "all", null)).toEqual({
        averageScore: null,
        passRate: null,
        bestAttempts: 0,
        byCourse: [],
      });
    });
  });
});
