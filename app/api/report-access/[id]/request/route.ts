import { after, NextRequest } from "next/server";
import { requestReportCode } from "@/lib/reports/sharing";
import { privateJson, requireOrigin, sharingBody, sharingFailure } from "@/lib/reports/sharingHttp";
import { REQUEST_MESSAGE, requireSharingConfig } from "@/lib/reports/sharingPolicy";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  try {
    const config = requireSharingConfig(); requireOrigin(req, config.origin);
    const { id } = await context.params, body = await sharingBody(req);
    const result = await requestReportCode(config, id, body.email);
    if (result.delivery) after(() => result.delivery!());
    // Mail is sent after response; no provider latency reveals the allowlist.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 300 - (Date.now() - started))));
    return privateJson({ message: REQUEST_MESSAGE, challengeId: result.challengeId }, 202);
  } catch (error) { return sharingFailure(error); }
}
