// Minimal Notion reader -- no SDK, just the REST API. Pulls a page's
// content as plain text so requirements/scoping docs can feed the AI
// estimator (and later, audits) as context.

const NOTION_VERSION = "2022-06-28";
const MAX_DEPTH = 2; // nested toggles/lists beyond this are skipped
const MAX_CHARS_PER_PAGE = 15000;

type Fetcher = typeof fetch;

interface RichText {
  plain_text?: string;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

interface BlockChildrenResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

function apiKey(): string {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY is not set");
  return key;
}

async function notionGet<T>(path: string, fetcher: Fetcher): Promise<T> {
  const res = await fetcher(`https://api.notion.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Notion-Version": NOTION_VERSION,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 404) {
      throw new Error(
        "Notion page not found — check the URL, and make sure the page is shared with your integration (page ⋯ menu → Connections)."
      );
    }
    throw new Error(body.message ?? `Notion API error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// Accepts a raw page ID (dashed or not) or a full Notion URL and returns
// the canonical dashed ID, or null if nothing ID-shaped is present.
export function parseNotionPageId(input: string): string | null {
  const match = input.trim().match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) return null;
  const hex = match[0].replace(/-/g, "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Pulls the readable text out of one block. Notion nests the rich_text
// array under a key named after the block's type.
export function blockToText(block: NotionBlock): string {
  const payload = block[block.type] as { rich_text?: RichText[]; cells?: RichText[][]; title?: string } | undefined;
  if (!payload) return "";

  if (block.type === "child_page") return payload.title ?? "";
  if (block.type === "table_row" && payload.cells) {
    return payload.cells.map((cell) => cell.map((rt) => rt.plain_text ?? "").join("")).join(" | ");
  }

  const text = (payload.rich_text ?? []).map((rt) => rt.plain_text ?? "").join("");
  if (!text) return "";
  if (block.type.startsWith("heading")) return `\n## ${text}`;
  if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") return `- ${text}`;
  if (block.type === "to_do") return `[ ] ${text}`;
  return text;
}

async function collectBlocks(
  blockId: string,
  depth: number,
  fetcher: Fetcher,
  lines: string[],
  budget: { chars: number }
): Promise<void> {
  let cursor: string | null = null;
  while (budget.chars > 0) {
    const page: BlockChildrenResponse = await notionGet<BlockChildrenResponse>(
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
      fetcher
    );
    for (const block of page.results) {
      if (budget.chars <= 0) return;
      if (block.type === "child_database" || block.type === "unsupported") continue;
      const text = blockToText(block);
      if (text) {
        lines.push(text);
        budget.chars -= text.length;
      }
      if (block.has_children && depth < MAX_DEPTH) {
        await collectBlocks(block.id, depth + 1, fetcher, lines, budget);
      }
    }
    if (!page.has_more || !page.next_cursor) return;
    cursor = page.next_cursor;
  }
}

interface PageObject {
  properties?: Record<string, { type: string; title?: RichText[] }>;
}

export interface NotionPageText {
  id: string;
  title: string;
  text: string;
}

const pageCache = new Map<string, { at: number; page: NotionPageText }>();
const PAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getNotionPageText(
  pageId: string,
  fetcher: Fetcher = fetch
): Promise<NotionPageText> {
  const cached = pageCache.get(pageId);
  if (cached && Date.now() - cached.at < PAGE_CACHE_TTL_MS) return cached.page;

  let title = "(untitled)";
  try {
    const page = await notionGet<PageObject>(`/pages/${pageId}`, fetcher);
    const titleProp = Object.values(page.properties ?? {}).find((p) => p.type === "title");
    const titleText = (titleProp?.title ?? []).map((rt) => rt.plain_text ?? "").join("");
    if (titleText) title = titleText;
  } catch {
    // Title is nice-to-have; content fetch below is what matters.
  }

  const lines: string[] = [];
  await collectBlocks(pageId, 0, fetcher, lines, { chars: MAX_CHARS_PER_PAGE });

  const result = { id: pageId, title, text: lines.join("\n").trim() };
  pageCache.set(pageId, { at: Date.now(), page: result });
  return result;
}
