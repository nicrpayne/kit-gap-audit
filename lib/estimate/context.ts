import { createHash } from "crypto";
import { getNotionPageText } from "@/lib/notion";
import { getFigmaRefText, parseFigmaRefKey } from "@/lib/figma";

const MAX_TOTAL_NOTION_CHARS = 20000;
const MAX_TOTAL_FIGMA_CHARS = 15000;
const MAX_TOTAL_DOC_CHARS = 20000;

export interface ReleaseContext {
  context: string;
  // Hash of the full assembled context. Mixed into every work item's
  // estimate hash, so editing the context text, the Notion docs, the
  // Figma refs, or a pasted doc marks all estimates stale -- context
  // changes every estimate by definition.
  contextHash: string;
  notionDocs: { id: string; title: string; chars: number }[];
  notionWarning: string | null;
  figmaRefs: { fileName: string; pageName: string; chars: number }[];
  figmaWarning: string | null;
  contextDocs: { label: string; chars: number }[];
}

interface ScopeForContext {
  name: string;
  teamKey: string;
  projectNames: string[];
  estimationContext: string | null;
  notionPageIds: string[];
  figmaRefs: string[];
  contextDocs: { label: string; content: string }[];
}

export async function buildReleaseContext(scope: ScopeForContext): Promise<ReleaseContext> {
  const parts: string[] = [
    `Scope: ${scope.name} (Linear team ${scope.teamKey}${scope.projectNames.length > 0 ? `, project${scope.projectNames.length > 1 ? "s" : ""} ${scope.projectNames.map((p) => `"${p}"`).join(", ")}` : ""}).`,
    scope.estimationContext?.trim() ||
      "No further team context provided -- assume a small, competent product team.",
  ];

  const notionDocs: ReleaseContext["notionDocs"] = [];
  const notionFailures: string[] = [];
  let remainingNotion = MAX_TOTAL_NOTION_CHARS;

  for (const pageId of scope.notionPageIds) {
    if (remainingNotion <= 0) break;
    try {
      const page = await getNotionPageText(pageId);
      const text = page.text.slice(0, remainingNotion);
      remainingNotion -= text.length;
      notionDocs.push({ id: page.id, title: page.title, chars: text.length });
      parts.push(`\nREQUIREMENTS / SCOPING DOC (from Notion): ${page.title}\n${text}`);
    } catch (error) {
      notionFailures.push(error instanceof Error ? error.message : "unknown error");
    }
  }

  const figmaRefs: ReleaseContext["figmaRefs"] = [];
  const figmaFailures: string[] = [];
  let remainingFigma = MAX_TOTAL_FIGMA_CHARS;

  for (const refKey of scope.figmaRefs) {
    if (remainingFigma <= 0) break;
    const parsed = parseFigmaRefKey(refKey);
    if (!parsed) continue;
    try {
      const ref = await getFigmaRefText(parsed.fileKey, parsed.nodeId);
      const text = ref.text.slice(0, remainingFigma);
      remainingFigma -= text.length;
      figmaRefs.push({ fileName: ref.fileName, pageName: ref.pageName, chars: text.length });
      parts.push(
        `\nDESIGN REFERENCE (from Figma, "${ref.fileName}" / "${ref.pageName}") -- screen names, flows, ` +
          `and on-canvas text. Treat as structural/visual scope, not committed requirements:\n${text}`
      );
    } catch (error) {
      figmaFailures.push(error instanceof Error ? error.message : "unknown error");
    }
  }

  const contextDocs: ReleaseContext["contextDocs"] = [];
  let remainingDocs = MAX_TOTAL_DOC_CHARS;

  for (const doc of scope.contextDocs) {
    if (remainingDocs <= 0) break;
    const text = doc.content.slice(0, remainingDocs);
    remainingDocs -= text.length;
    contextDocs.push({ label: doc.label, chars: text.length });
    parts.push(
      `\nADDITIONAL CONTEXT (pasted by the team, "${doc.label}") -- e.g. a spreadsheet export or notes; ` +
        `may include the team's own effort estimates or status, which are a signal alongside Linear's ` +
        `points, not automatically correct:\n${text}`
    );
  }

  const context = parts.join("\n");
  return {
    context,
    contextHash: createHash("sha256").update(context).digest("hex").slice(0, 16),
    notionDocs,
    notionWarning:
      notionFailures.length > 0 ? `Couldn't read ${notionFailures.length} Notion page(s): ${notionFailures[0]}` : null,
    figmaRefs,
    figmaWarning:
      figmaFailures.length > 0 ? `Couldn't read ${figmaFailures.length} Figma page(s): ${figmaFailures[0]}` : null,
    contextDocs,
  };
}
