import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";

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

const assetFiles = (await listAssetFiles(path.resolve("dist/assets"))).sort();
const routes = JSON.parse(await readFile(path.resolve("dist/_routes.json"), "utf8"));
const expectedExcludes = assetFiles.map((asset) => `/assets/${asset}`);
const allRoutes = [...routes.include, ...routes.exclude];

if (routes.version !== 1 || JSON.stringify(routes.include) !== JSON.stringify(["/assets/*"])) {
  throw new Error("dist/_routes.json must route only unknown /assets/* requests through Functions.");
}
if (JSON.stringify(routes.exclude) !== JSON.stringify(expectedExcludes)) {
  throw new Error("dist/_routes.json must exclude every built asset from Functions.");
}
if (allRoutes.length > 100 || allRoutes.some((route) => route.length > 100)) {
  throw new Error("dist/_routes.json exceeds Cloudflare Pages routing limits.");
}

const serviceWorker = await readFile(path.resolve("dist/sw.js"), "utf8");
const missingPrecacheAssets = assetFiles
  .filter((asset) => /\.(?:js|css)$/.test(asset))
  .filter((asset) => !serviceWorker.includes(`assets/${asset}`));

if (missingPrecacheAssets.length > 0) {
  throw new Error(`Service worker precache is missing: ${missingPrecacheAssets.join(", ")}`);
}

const coverPath = "/blog-covers/mhs-common-interface.png";
const cover = await readFile(path.resolve(`dist${coverPath}`));
if (cover.toString("hex", 0, 8) !== "89504e470d0a1a0a" || cover.readUInt32BE(16) !== 1672 || cover.readUInt32BE(20) !== 941) {
  throw new Error("MHS cover must be a valid 1672 x 941 PNG.");
}
const articleHtml = await readFile(path.resolve("dist/blog/model-hardware-standard/index.html"), "utf8");
const coverUrl = `https://armatureailabs.com${coverPath}`;
const articleDom = new JSDOM(articleHtml);
const articleHead = articleDom.window.document.head;
if (articleHead.querySelector('meta[property="og:image"]')?.getAttribute("content") !== coverUrl ||
    articleHead.querySelector('meta[name="twitter:image"]')?.getAttribute("content") !== coverUrl ||
    !articleHead.querySelector('meta[name="robots"]')?.getAttribute("content")?.includes("max-image-preview:large")) {
  throw new Error("MHS article shell is missing static cover metadata.");
}
const articleData = JSON.parse(articleHead.querySelector('script[type="application/ld+json"]')?.textContent ?? "null");
const blogPosting = articleData?.["@graph"]?.find((item) => item["@type"] === "BlogPosting");
if (blogPosting?.image?.url !== coverUrl || blogPosting.image.width !== 1672 || blogPosting.image.height !== 941) {
  throw new Error("MHS article shell is missing BlogPosting image data.");
}
articleDom.window.close();

console.log(`Release artifacts verified: ${assetFiles.length} static assets bypass Functions.`);
