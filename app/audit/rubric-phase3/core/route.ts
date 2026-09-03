import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPhase3RubricCore } from "@/lib/audit/rubricPhase3Core";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = await readFile(join(process.cwd(), "public/audit-rubric-phase1/_core.js"), "utf8");
  const body = buildPhase3RubricCore(source);
  return new Response(body, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "x-signal-rubric-extension": "phase3-bounded-semantics",
    },
  });
}
