import { eq, and, desc } from "drizzle-orm";
import { db } from "~/db";
import { courses, lessonBookmarks, lessons, modules } from "~/db/schema";

// ─── Bookmark Service ───
// Handles lessons a user has saved to come back to later.
// One bookmark per user per lesson. Bookmarks are deleted with their lesson
// by the foreign-key cascade.
// Uses positional parameters (project convention).

export function isLessonBookmarked(userId: number, lessonId: number) {
  const row = db
    .select({ id: lessonBookmarks.id })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();
  return row !== undefined;
}

/**
 * Bookmarks a lesson for the user. Bookmarking an already-bookmarked lesson
 * leaves the existing bookmark as it is.
 */
export function addBookmark(userId: number, lessonId: number) {
  db.insert(lessonBookmarks)
    .values({ userId, lessonId })
    .onConflictDoNothing({
      target: [lessonBookmarks.userId, lessonBookmarks.lessonId],
    })
    .run();
}

/**
 * Removes the user's bookmark on a lesson. Does nothing if there isn't one.
 */
export function removeBookmark(userId: number, lessonId: number) {
  db.delete(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .run();
}

/**
 * Lists the lessons a user has bookmarked, newest first, with what's needed
 * to render a row and link to the lesson. Not filtered by access: a bookmark
 * stays listed when the user loses access, and the lesson page explains why.
 */
export function listSavedLessons(userId: number) {
  return db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(lessonBookmarks)
    .innerJoin(lessons, eq(lessonBookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessonBookmarks.userId, userId))
    // Break timestamp ties by insertion order so the latest add stays on top
    .orderBy(desc(lessonBookmarks.createdAt), desc(lessonBookmarks.id))
    .all();
}
