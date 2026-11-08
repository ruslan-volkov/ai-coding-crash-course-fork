import { data } from "react-router";
import type { Route } from "./+types/api.analytics-stream";
import { requireInstructorOrAdmin, requireStaff } from "~/lib/access.server";
import { getCourseById } from "~/services/courseService";
import { listInstructors } from "~/services/userService";
import {
  subscribeToAnalyticsStream,
  type AnalyticsStreamScope,
} from "~/services/analyticsStreamService";

// ─── Analytics Stream ───
// Server-Sent Events feed of analytics change events (`{ type, courseId }`,
// never data) for the live analytics pages, which re-run their loaders on
// receipt. Authorised like the pages it serves:
//
//   ?courseId=<id>    course analytics — the owning instructor or an admin
//   (no params)       an instructor's own courses, or everything for an admin
//   ?instructor=<id>  admin only — narrowed to that instructor's courses
//
// Students and signed-out visitors are refused.

const HEARTBEAT_MS = 15_000;

async function resolveScope(
  request: Request,
  url: URL
): Promise<AnalyticsStreamScope> {
  const courseParam = url.searchParams.get("courseId");
  if (courseParam !== null) {
    const courseId = Number(courseParam);
    if (!Number.isInteger(courseId)) {
      throw data("Invalid course ID.", { status: 400 });
    }
    await requireStaff(request, courseId);
    if (!getCourseById(courseId)) {
      throw data("Course not found.", { status: 404 });
    }
    return { kind: "course", courseId };
  }

  const { userId, isAdmin } = await requireInstructorOrAdmin(request);
  if (!isAdmin) {
    return { kind: "instructor", instructorId: userId };
  }

  // Same fallback as the admin page: an unknown id means all instructors.
  const requested = Number(url.searchParams.get("instructor"));
  const instructor = listInstructors().find((i) => i.id === requested);
  return instructor
    ? { kind: "instructor", instructorId: instructor.id }
    : { kind: "all" };
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const scope = await resolveScope(request, url);
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const unsubscribe = subscribeToAnalyticsStream(scope, (event) =>
        send(`data: ${JSON.stringify(event)}\n\n`)
      );
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      };
      request.signal.addEventListener("abort", cleanup);

      // Flush headers straight away so the client sees the stream open.
      send("retry: 3000\n: connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform keeps compression middleware from buffering the stream.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
