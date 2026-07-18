import { createHash } from "crypto";
import { getNotionPageText } from "@/lib/notion";

const MAX_TOTAL_NOTION_CHARS = 20000;

export interface ReleaseContext {
  context: string;
  // Hash of the full assembled context. Mixed into every work item's
  // estimate hash, so editing the context text or the Notion docs marks
  // all estimates stale -- context changes every estimate by definition.
  contextHash: string;
  notionDocs: { id: string; title: string; chars: number }[];
  notionWarning: string | null;
}

interface ScopeForContext {
  name: string;
  teamKey: string;
  projectName: string | null;
  estimationContext: string | null;
  notionPageIds: string[];
}

export async function buildReleaseContext(scope: ScopeForContext): Promise<ReleaseContext> {
  const parts: string[] = [
    `Scope: ${scope.name} (Linear team ${scope.teamKey}${scope.projectName ? `, project "${scope.projectName}"` : ""}).`,
    scope.estimationContext?.trim() ||
      "No further team context provided -- assume a small, competent product team.",
  ];

  const notionDocs: ReleaseContext["notionDocs"] = [];
  const failures: string[] = [];
  let remaining = MAX_TOTAL_NOTION_CHARS;

  for (const pageId of scope.notionPageIds) {
    if (remaining <= 0) break;
    try {
      const page = await getNotionPageText(pageId);
      const text = page.text.slice(0, remaining);
      remaining -= text.length;
      notionDocs.push({ id: page.id, title: page.title, chars: text.length });
      parts.push(`\nREQUIREMENTS / SCOPING DOC (from Notion): ${page.title}\n${text}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "unknown error");
    }
  }

  const context = parts.join("\n");
  return {
    context,
    contextHash: createHash("sha256").update(context).digest("hex").slice(0, 16),
    notionDocs,
    notionWarning: failures.length > 0 ? `Couldn't read ${failures.length} Notion page(s): ${failures[0]}` : null,
  };
}
