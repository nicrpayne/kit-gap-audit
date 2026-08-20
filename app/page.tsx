import { redirect } from "next/navigation";

// SIGNAL OPENS IN THE CONTROL ROOM.
//
// The old Workbench dashboard was the landing page for as long as this was
// a prototype, and it is still reachable at /dashboard — nothing about it
// was deleted. But it answers a question nobody arrives with. A leader
// opening Signal is asking "what is happening right now", and that is the
// Control Room's whole job.
//
// A redirect rather than a move: /control-room stays the canonical URL, so
// every link, proof and bookmark that already points at it keeps working.
export default function Home() {
  redirect("/control-room");
}
