import { NextResponse } from "next/server";
import { buildPayload } from "@/lib/version";

// GET /api/version — WHICH COMMIT IS THIS PROCESS RUNNING?
//
// UNAUTHENTICATED, DELIBERATELY. It is the one route that has to answer
// before you can prove anything else about a deployment, and requiring the
// session cookie would make it useless for exactly the check it exists for:
// a CI step, a curl, or a deploy verifier asking "is the thing I just pushed
// the thing that is running". `/api/version` is in the middleware's public
// list beside `/login` for that reason and no other.
//
// It is safe to serve openly because of what it CANNOT do rather than
// because of what it happens to return. `buildPayload()` copies six named
// keys out of a frozen object; there is no key parameter, no passthrough,
// and no path from a request to `process.env`. A field added to the identity
// type without being added to the allowlist is not served.
//
// FORCE-DYNAMIC because the answer is a fact about the running container,
// and a prerendered answer would be a fact about the build machine — which
// is the same confusion this endpoint was added to end. The values are read
// once at module load, so "dynamic" costs a function invocation, not work.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildPayload(), {
    headers: {
      // Never cached, anywhere. A CDN holding yesterday's build id would
      // reintroduce the defect wearing the fix's clothes.
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
