import type { VideoWatchThroughRow } from "~/services/analyticsService";
import { Section } from "./section";
import { formatRatio } from "./format";

interface VideoWatchThroughProps {
  videos: VideoWatchThroughRow[];
  students: number;
}

/** Share of the cohort that started and finished each video, in course order. */
export function VideoWatchThrough({ videos, students }: VideoWatchThroughProps) {
  const emptyMessage =
    videos.length === 0
      ? "No videos in this course"
      : students === 0
        ? "No students enrolled in this period"
        : null;

  return (
    <Section title="Videos" emptyMessage={emptyMessage}>
      <table className="w-full text-sm" aria-label="Video watch-through">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Lesson</th>
            <th className="py-2 text-right font-medium">Started</th>
            <th className="py-2 text-right font-medium">Finished</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.lessonId} className="border-b last:border-0">
              <td className="py-2 font-medium">{video.title}</td>
              <td className="py-2 text-right tabular-nums">
                {formatRatio(video.started)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatRatio(video.finished)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
