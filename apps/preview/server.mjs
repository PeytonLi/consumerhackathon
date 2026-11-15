import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const round = url.pathname.match(/^\/r\/([a-z0-9-]+)\/?$/);

  if (round) {
    const rounds = JSON.parse(await readFile(join(root, "rounds.json"), "utf8"));
    const id = round[1];
    const data = { id, ...(rounds[id] ?? { game: "missing", title: "Nickel" }) };
    const head = [
      `<meta property="og:title" content="${escapeHtml(data.title)} · ${escapeHtml(data.league ?? "Nickel")}">`,
      `<meta property="og:site_name" content="nickel.app">`,
      `<script>window.ROUND = ${JSON.stringify(data).replace(/</g, "\\u003c")};</script>`,
    ].join("\n");
    const html = (await readFile(join(root, "play.html"), "utf8")).replace("<!--ROUND-->", head);
    res.writeHead(200, { "content-type": types[".html"], "cache-control": "no-store" });
    res.end(html);
    return;
  }

  const file = normalize(join(root, url.pathname === "/" ? "messages.html" : url.pathname));
  if (!file.startsWith(root)) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "0.0.0.0", () => console.log(`Nickel preview on http://localhost:${port}`));
