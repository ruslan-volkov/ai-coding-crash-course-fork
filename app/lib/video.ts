// ─── Video Completion ───
// Lives here rather than in videoTrackingService so client components can
// import it without pulling the database driver into the browser bundle.

/**
 * Watch progress (whole percent of the video's duration, by furthest position
 * reached) at or above which a video counts as finished. The one definition
 * shared by per-user video completion and course analytics.
 */
export const VIDEO_COMPLETION_THRESHOLD = 90;
