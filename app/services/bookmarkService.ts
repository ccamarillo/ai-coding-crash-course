import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks } from "~/db/schema";

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
