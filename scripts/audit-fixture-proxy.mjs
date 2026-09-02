// Local-only visual review proxy.
//
// Keeps the application completely unchanged while serving the deterministic
// Audit graph fixture to a real browser. Everything except the two read-only
// Audit endpoints is streamed from the normal Next development server.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const upstream = new URL(process.env.UPSTREAM ?? "http://127.0.0.1:3000");
const port = Number(process.env.PORT ?? 3001);
const graphPath = process.env.RENDERER_GRAPH ?? "/tmp/signal-renderer-graph.json";
const fixture = JSON.parse(readFileSync(graphPath, "utf8"));
const { truth, ...graphPayload } = fixture;
const graph = Buffer.from(JSON.stringify(graphPayload));
const truthPath = process.env.RENDERER_TRUTH;
const truthPayload = truthPath
  ? Buffer.from(readFileSync(truthPath, "utf8"))
  : truth
    ? Buffer.from(JSON.stringify(truth))
    : null;
const hopByHop = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

  if (url.pathname === "/api/audit/graph") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(graph);
    return;
  }
  if (url.pathname === "/api/audit/truth") {
    response.writeHead(truthPayload ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(truthPayload ?? '{"error":"absent"}');
    return;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value != null && !hopByHop.has(name)) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("host", upstream.host);

  const target = new URL(url.pathname + url.search, upstream);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : request;
  let proxied;
  try {
    proxied = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      duplex: body ? "half" : undefined,
    });
  } catch (error) {
    response.writeHead(502, { "content-type": "text/plain" });
    response.end(error instanceof Error ? error.message : String(error));
    return;
  }

  const outHeaders = Object.fromEntries(proxied.headers.entries());
  delete outHeaders["content-encoding"];
  delete outHeaders["content-length"];
  delete outHeaders.connection;
  delete outHeaders["transfer-encoding"];
  response.writeHead(proxied.status, outHeaders);
  if (!proxied.body) {
    response.end();
    return;
  }
  for await (const chunk of proxied.body) response.write(chunk);
  response.end();
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Audit fixture proxy: http://127.0.0.1:${port}`);
});
