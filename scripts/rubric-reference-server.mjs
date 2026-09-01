// Local visual oracle: the unmodified Rubric browser source, populated with
// the same deterministic Signal fixture through a server-side adapter.
// Nothing here is imported by Signal or included in its application bundle.

import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFileSync } from "node:fs";

const root = join(process.cwd(), "lab/rubric-reference/second-brain/public");
const payload = JSON.parse(readFileSync(process.env.RENDERER_GRAPH ?? "/tmp/signal-renderer-graph.json", "utf8"));
const port = Number(process.env.PORT ?? 3002);

const laneColors = ["#58abf5", "#b47aff", "#ff7043", "#56d97a", "#f5a623", "#50e3c2", "#e040fb", "#8fa3ad"];
const signalNodes = payload.graph.nodes;
const laneNodes = signalNodes.filter((node) => node.attributes.kind === "lane");
const departments = laneNodes.map((node, index) => ({
  key: node.attributes.lane ?? node.key.replace(/^lane:/, ""),
  label: node.attributes.label,
  color: laneColors[index % laneColors.length],
  icon: "data",
}));
const colorByLane = new Map(departments.map((department) => [department.key, department.color]));

const idMap = new Map();
for (const node of signalNodes) {
  if (node.attributes.kind === "reality") idMap.set(node.key, "CLAUDE.md");
  else if (node.attributes.kind === "lane") idMap.set(node.key, `hub:${node.attributes.lane ?? node.key.replace(/^lane:/, "")}`);
  else idMap.set(node.key, node.key);
}

const nodes = signalNodes.map((node) => {
  const attrs = node.attributes;
  const dept = attrs.lane ?? departments[0]?.key ?? "signal";
  const base = {
    id: idMap.get(node.key),
    label: attrs.label,
    dept,
    layer: "M",
    access: "both",
    path: node.key,
    ext: ".md",
    size: 1200,
    color: colorByLane.get(dept),
  };
  if (attrs.kind === "reality") return { ...base, type: "router" };
  if (attrs.kind === "lane") return { ...base, type: "hub", hubKind: "dept" };
  if (["source", "transcript", "notion_page", "figma_artifact"].includes(attrs.kind)) {
    return { ...base, type: "app", status: "ok" };
  }
  if (attrs.kind === "intelligence") return { ...base, type: "dir", files: 192, expanded: false };
  if (attrs.kind === "decision") return { ...base, type: "routine" };
  return { ...base, type: "file" };
});

const links = payload.graph.edges.flatMap((edge) => {
  const s = idMap.get(edge.source);
  const t = idMap.get(edge.target);
  if (!s || !t || s === t) return [];
  const target = signalNodes.find((node) => node.key === edge.target);
  const k = target?.attributes.kind === "lane" ? "spoke" : edge.attributes.basis === "external" ? "xlink" : "link";
  return [{ s, t, k, w: 1 }];
});

const graph = JSON.stringify({
  meta: { files: nodes.length, dirs: nodes.filter((node) => node.type === "dir").length },
  departments,
  layers: [
    { key: "M", label: "Signal", color: "#58abf5", shape: "orb" },
    { key: "S", label: "Evidence", color: "#ff6b1a", shape: "spark" },
    { key: "R", label: "Decisions", color: "#b47aff", shape: "orbit" },
    { key: "A", label: "Sources", color: "#50e3c2", shape: "hex" },
  ],
  nodes,
  links,
  mdLinks: [],
});

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
  if (url.pathname === "/api/graph") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(graph);
    return;
  }
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safe = normalize(requestPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  try {
    const file = join(root, safe);
    const body = readFileSync(file);
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Rubric reference: http://127.0.0.1:${port}`);
});
