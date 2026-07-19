// Minimal Figma reader -- raw REST API (no SDK), mirrors lib/notion.ts.
// Pulls a design page/frame's structure and text content as plain text so
// design-derived scope can feed the AI estimator, same as Notion docs.
//
// This is a plain-text extraction, not the richer design-context/screenshot
// tooling available interactively via the Figma MCP connector -- deliberate
// scope choice: text-level context, contained build, same shape as Notion.

const MAX_DEPTH = 8; // design trees nest deeper than Notion blocks
const MAX_CHARS_PER_REF = 12000;

type Fetcher = typeof fetch;

// Node types that are pure decoration -- never worth a line unless they
// happen to have children (rare, but some vector groups do).
const SKIP_LEAF_TYPES = new Set([
  "RECTANGLE",
  "ELLIPSE",
  "VECTOR",
  "LINE",
  "STAR",
  "POLYGON",
  "BOOLEAN_OPERATION",
]);

// Structural node types worth naming as a heading when they have a
// human-given (non-default-looking) name.
const STRUCTURAL_TYPES = new Set(["FRAME", "GROUP", "COMPONENT", "COMPONENT_SET", "INSTANCE", "SECTION"]);

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  children?: FigmaNode[];
}

interface FigmaNodesResponse {
  name?: string;
  nodes: Record<string, { document: FigmaNode } | undefined>;
}

function apiKey(): string {
  const key = process.env.FIGMA_API_KEY;
  if (!key) throw new Error("FIGMA_API_KEY is not set");
  return key;
}

// Accepts a Figma design URL and returns { fileKey, nodeId } (nodeId in
// colon form, e.g. "399:9068"), or null if the URL doesn't contain both.
// Node ID in URLs is dash-separated ("399-9068"); the API wants colons.
export function parseFigmaUrl(input: string): { fileKey: string; nodeId: string } | null {
  const trimmed = input.trim();
  const fileMatch = trimmed.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
  const nodeMatch = trimmed.match(/node-id=([0-9]+)[-:]([0-9]+)/);
  if (!fileMatch || !nodeMatch) return null;
  return { fileKey: fileMatch[1], nodeId: `${nodeMatch[1]}:${nodeMatch[2]}` };
}

export function figmaRefKey(ref: { fileKey: string; nodeId: string }): string {
  return `${ref.fileKey}:${ref.nodeId}`;
}

export function parseFigmaRefKey(key: string): { fileKey: string; nodeId: string } | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null; // fileKey : nodeIdPart1 : nodeIdPart2
  return { fileKey: parts[0], nodeId: `${parts[1]}:${parts[2]}` };
}

// "Rectangle 47", "Frame 12", "Group 3" etc -- Figma's auto-generated
// default names carry no signal and just add noise.
const DEFAULT_NAME_RE = /^(Frame|Group|Rectangle|Ellipse|Vector|Component|Instance|Line|Star|Polygon)\s*\d*$/i;

function collect(node: FigmaNode, depth: number, lines: string[], budget: { chars: number }): void {
  if (budget.chars <= 0 || depth > MAX_DEPTH) return;

  if (node.type === "TEXT" && node.characters?.trim()) {
    const text = node.characters.trim();
    lines.push(text);
    budget.chars -= text.length;
  } else if (STRUCTURAL_TYPES.has(node.type) && node.name && !DEFAULT_NAME_RE.test(node.name)) {
    lines.push(`\n## ${node.name}`);
    budget.chars -= node.name.length;
  } else if (SKIP_LEAF_TYPES.has(node.type) && !node.children?.length) {
    return;
  }

  for (const child of node.children ?? []) {
    if (budget.chars <= 0) return;
    collect(child, depth + 1, lines, budget);
  }
}

export interface FigmaRefText {
  fileKey: string;
  nodeId: string;
  fileName: string;
  pageName: string;
  text: string;
}

const refCache = new Map<string, { at: number; ref: FigmaRefText }>();
const REF_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getFigmaRefText(
  fileKey: string,
  nodeId: string,
  fetcher: Fetcher = fetch
): Promise<FigmaRefText> {
  const cacheKey = figmaRefKey({ fileKey, nodeId });
  const cached = refCache.get(cacheKey);
  if (cached && Date.now() - cached.at < REF_CACHE_TTL_MS) return cached.ref;

  const res = await fetcher(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`, {
    headers: { "X-Figma-Token": apiKey() },
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Figma file or node not found — check the URL is a design file link with a node selected.");
    }
    if (res.status === 403) {
      throw new Error("Figma denied access — check FIGMA_API_KEY has access to this file.");
    }
    const body = (await res.json().catch(() => ({}))) as { message?: string; err?: string };
    throw new Error(body.message ?? body.err ?? `Figma API error (${res.status})`);
  }

  const data = (await res.json()) as FigmaNodesResponse;
  const entry = data.nodes[nodeId];
  if (!entry) throw new Error(`Node ${nodeId} not found in that Figma file.`);

  const lines: string[] = [];
  collect(entry.document, 0, lines, { chars: MAX_CHARS_PER_REF });

  const ref: FigmaRefText = {
    fileKey,
    nodeId,
    fileName: data.name ?? "(untitled file)",
    pageName: entry.document.name || "(untitled)",
    text: lines.join("\n").trim(),
  };
  refCache.set(cacheKey, { at: Date.now(), ref });
  return ref;
}
