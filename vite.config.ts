import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
import { handleNickelRequest } from "./server/card.js";

function nickelCardPlugin(): Plugin {
  return {
    name: "nickel-card",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url ?? "/";
        if (!/^\/(c|og|api\/keiki)\//.test(path)) return next();
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          const request = new Request("http://" + (req.headers.host ?? "localhost:5173") + path, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response = await handleNickelRequest(request, async (pathname) =>
            server.transformIndexHtml(pathname, await readFile("index.html", "utf8"))
          );
          if (!response) return next();
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), nickelCardPlugin()],
  server: { host: "0.0.0.0", port: 5173, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true },
});
