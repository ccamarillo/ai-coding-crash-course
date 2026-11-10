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
  getNewEnrollments,
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
});
