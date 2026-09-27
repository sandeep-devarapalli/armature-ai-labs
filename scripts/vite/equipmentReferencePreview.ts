import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function equipmentReferencePreview(): Plugin {
  const files: Record<string, string> = { "p2s-product.jpg": "image/jpeg", "p2s-screen.jpg": "image/jpeg", "jetson-product.jpg": "image/jpeg", "jetson-layout.png": "image/png" };
  return {
    name: "equipment-reference-preview",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/equipment-reference-preview", async (request, response, next) => {
        const file = request.url?.split("?")[0].slice(1) ?? "";
        if (!files[file]) { next(); return; }
        try {
          const bytes = await readFile(resolve(server.config.root, "output/equipment-reference-media", file));
          response.setHeader("Content-Type", files[file]); response.setHeader("Cache-Control", "no-store"); response.end(bytes);
        } catch { response.statusCode = 404; response.end(); }
      });
    }
  };
}
