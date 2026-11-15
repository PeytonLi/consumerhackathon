import { handleNickelRequest } from "./card.js";

const dist = new URL("../dist/", import.meta.url).pathname;
const indexHtml = () => Bun.file(dist + "index.html").text();
const port = Number(process.env.PORT ?? 4173);

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(request) {
    const handled = await handleNickelRequest(request, indexHtml);
    if (handled) return handled;
    const pathname = new URL(request.url).pathname;
    const file = Bun.file(dist + pathname.replace(/^\/+/, "").replace(/\.\./g, ""));
    if (pathname !== "/" && (await file.exists())) return new Response(file);
    const fallback = await handleNickelRequest(new Request(new URL("/c/KRILL5", request.url), { headers: request.headers }), indexHtml);
    return fallback ?? new Response("Not found", { status: 404 });
  },
});

console.log("Nickel listening on " + port);
