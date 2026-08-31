import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { extname, join } from "path";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
createServer((req, res) => {
  const p = join(process.cwd(), decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!existsSync(p)) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(p));
}).listen(4400, () => console.log("lab on http://localhost:4400"));
