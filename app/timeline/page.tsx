import TimelinePageClient from "@/components/TimelinePageClient";

// Instrument Mode: the surface owns the viewport (see lib/shell/mode.ts).
// This route was a ComingNext stub describing "a Gantt view of Linear
// issues against the release date" -- which is precisely what Timeline is
// not. It is the project's story arranged in time, and the thing you do
// with it is press play.
export default function TimelinePage() {
  return <TimelinePageClient />;
}
