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
  addBookmark,
  removeBookmark,
  isLessonBookmarked,
  listSavedLessons,
} from "./bookmarkService";

let moduleId: number;
let lessonId: number;

describe("bookmarkService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);

    const mod = testDb
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Module 1", position: 1 })
      .returning()
      .get();
    moduleId = mod.id;
    lessonId = testDb
      .insert(schema.lessons)
      .values({ moduleId, title: "Lesson 1", position: 1 })
      .returning()
      .get().id;
  });

  describe("addBookmark", () => {
    it("bookmarks a lesson for the user", () => {
      addBookmark(base.user.id, lessonId);

      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(true);
    });

    it("leaves a single bookmark when the same lesson is added twice", () => {
      addBookmark(base.user.id, lessonId);
      expect(() => addBookmark(base.user.id, lessonId)).not.toThrow();

      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(true);
      // No public read counts bookmarks yet, so count the rows directly
      const rows = testDb.select().from(schema.lessonBookmarks).all();
      expect(rows).toHaveLength(1);
    });
  });

  describe("removeBookmark", () => {
    it("removes the user's bookmark on a lesson", () => {
      addBookmark(base.user.id, lessonId);

      removeBookmark(base.user.id, lessonId);

      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(false);
    });

    it("does nothing when the lesson isn't bookmarked", () => {
      expect(() => removeBookmark(base.user.id, lessonId)).not.toThrow();
      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(false);
    });
  });

  describe("isLessonBookmarked", () => {
    it("returns false for a lesson the user hasn't bookmarked", () => {
      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(false);
    });

    it("does not show one user's bookmark to another user", () => {
      addBookmark(base.user.id, lessonId);

      expect(isLessonBookmarked(base.instructor.id, lessonId)).toBe(false);
    });
  });

  describe("listSavedLessons", () => {
    let secondLessonId: number;
    let otherCourseLessonId: number;

    beforeEach(() => {
      secondLessonId = testDb
        .insert(schema.lessons)
        .values({ moduleId, title: "Lesson 2", position: 2 })
        .returning()
        .get().id;

      // Archived, so the list is shown to include lessons the user may no
      // longer be able to view.
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          salesCopy: "Sales copy",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Archived,
        })
        .returning()
        .get();
      const otherMod = testDb
        .insert(schema.modules)
        .values({ courseId: otherCourse.id, title: "Other Module", position: 1 })
        .returning()
        .get();
      otherCourseLessonId = testDb
        .insert(schema.lessons)
        .values({ moduleId: otherMod.id, title: "Other Lesson", position: 1 })
        .returning()
        .get().id;

      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function bookmarkAt(userId: number, id: number, at: string) {
      vi.setSystemTime(new Date(at));
      addBookmark(userId, id);
    }

    it("returns an empty list when the user has no bookmarks", () => {
      expect(listSavedLessons(base.user.id)).toEqual([]);
    });

    it("lists saved lessons newest first with their lesson and course details", () => {
      bookmarkAt(base.user.id, lessonId, "2026-01-01T00:00:00.000Z");
      bookmarkAt(base.user.id, otherCourseLessonId, "2026-01-03T00:00:00.000Z");
      bookmarkAt(base.user.id, secondLessonId, "2026-01-02T00:00:00.000Z");

      expect(listSavedLessons(base.user.id)).toEqual([
        {
          lessonId: otherCourseLessonId,
          lessonTitle: "Other Lesson",
          courseTitle: "Other Course",
          courseSlug: "other-course",
        },
        {
          lessonId: secondLessonId,
          lessonTitle: "Lesson 2",
          courseTitle: "Test Course",
          courseSlug: "test-course",
        },
        {
          lessonId,
          lessonTitle: "Lesson 1",
          courseTitle: "Test Course",
          courseSlug: "test-course",
        },
      ]);
    });

    it("lists lessons bookmarked at the same moment latest-added first", () => {
      bookmarkAt(base.user.id, lessonId, "2026-01-01T00:00:00.000Z");
      bookmarkAt(base.user.id, secondLessonId, "2026-01-01T00:00:00.000Z");

      expect(listSavedLessons(base.user.id).map((l) => l.lessonId)).toEqual([
        secondLessonId,
        lessonId,
      ]);
    });

    it("drops a lesson once its bookmark is removed", () => {
      bookmarkAt(base.user.id, lessonId, "2026-01-01T00:00:00.000Z");
      bookmarkAt(base.user.id, secondLessonId, "2026-01-02T00:00:00.000Z");

      removeBookmark(base.user.id, secondLessonId);

      expect(listSavedLessons(base.user.id).map((l) => l.lessonId)).toEqual([
        lessonId,
      ]);
    });

    it("never lists one user's bookmarks for another user", () => {
      bookmarkAt(base.user.id, lessonId, "2026-01-01T00:00:00.000Z");
      bookmarkAt(base.instructor.id, secondLessonId, "2026-01-02T00:00:00.000Z");

      expect(listSavedLessons(base.user.id).map((l) => l.lessonId)).toEqual([
        lessonId,
      ]);
      expect(listSavedLessons(base.instructor.id).map((l) => l.lessonId)).toEqual([
        secondLessonId,
      ]);
    });
  });

  it("keeps each user's bookmark separate when one removes theirs", () => {
    addBookmark(base.user.id, lessonId);
    addBookmark(base.instructor.id, lessonId);

    removeBookmark(base.instructor.id, lessonId);

    expect(isLessonBookmarked(base.user.id, lessonId)).toBe(true);
    expect(isLessonBookmarked(base.instructor.id, lessonId)).toBe(false);
  });
});
