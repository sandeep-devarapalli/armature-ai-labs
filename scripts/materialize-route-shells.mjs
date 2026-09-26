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

const assetFiles = await listAssetFiles(path.resolve("dist/assets"));
const functionRoutes = {
  version: 1,
  include: ["/assets/*"],
  exclude: assetFiles.map((asset) => `/assets/${asset}`).sort()
};
const allRoutes = [...functionRoutes.include, ...functionRoutes.exclude];

if (allRoutes.length > 100) {
  throw new Error("Cloudflare _routes.json supports at most 100 include/exclude rules.");
}

const oversizedRoute = allRoutes.find((route) => route.length > 100);
if (oversizedRoute) {
  throw new Error(`Cloudflare _routes.json routes may not exceed 100 characters: ${oversizedRoute}`);
}

await writeFile(
  path.resolve("dist/_routes.json"),
  `${JSON.stringify(functionRoutes, null, 2)}\n`
);
