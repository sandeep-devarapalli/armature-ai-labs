import { access, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const legacyDirectoryRoutes = ["building-vision", "projects"];
await Promise.all(
  legacyDirectoryRoutes.map((route) => access(path.resolve("dist", route, "index.html")))
);

async function listAssetFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? listAssetFiles(path.join(directory, entry.name), relativePath)
      : [relativePath];
  }));
  return files.flat();
}

const include = ["/assets/*", "/api/event-payment-return"];
const assetFiles = await listAssetFiles(path.resolve("dist/assets"));
const exclude = assetFiles.map((asset) => `/assets/${asset}`)
  .filter((route) => route.length <= 100)
  .sort()
  .slice(0, 100 - include.length);
const functionRoutes = { version: 1, include, exclude };

await writeFile(
  path.resolve("dist/_routes.json"),
  `${JSON.stringify(functionRoutes, null, 2)}\n`
);
