import { describe, it, expect, beforeEach, vi } from "vitest";
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
} from "./bookmarkService";

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
    lessonId = testDb
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
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

  it("keeps each user's bookmark separate when one removes theirs", () => {
    addBookmark(base.user.id, lessonId);
    addBookmark(base.instructor.id, lessonId);

    removeBookmark(base.instructor.id, lessonId);

    expect(isLessonBookmarked(base.user.id, lessonId)).toBe(true);
    expect(isLessonBookmarked(base.instructor.id, lessonId)).toBe(false);
  });
});
