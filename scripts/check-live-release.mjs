import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = new URL(process.argv[2] ?? "https://armatureailabs.com");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function listBuiltCode(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? listBuiltCode(path.join(directory, entry.name), relativePath)
      : /\.(?:js|css)$/.test(entry.name) ? [relativePath] : [];
  }));
  return files.flat();
}

function fetchBounded(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
}

function requireResponse(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyRelease() {
  const builtHtml = await readFile(path.resolve("dist/index.html"), "utf8");
  const expectedEntry = builtHtml.match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
  const builtCode = (await listBuiltCode(path.resolve("dist/assets"))).sort();
  const root = await fetchBounded(baseUrl, { headers: { "Cache-Control": "no-cache" } });
  const rootType = root.headers.get("content-type") ?? "";
  const rootCache = root.headers.get("cache-control") ?? "";
  const html = await root.text();
  const entryPath = html.match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];

  requireResponse(expectedEntry, "Built HTML must reference a JavaScript entry.");
  requireResponse(root.status === 200 && rootType.includes("text/html"), "Root must return HTML 200.");
  requireResponse(rootCache.includes("max-age=0") && rootCache.includes("must-revalidate"), "Root HTML must revalidate.");
  requireResponse(entryPath === expectedEntry, "Custom domain must serve this build's JavaScript entry.");

  const [codeResponses, missing, deepRoute] = await Promise.all([
    Promise.all(builtCode.map(async (asset) => ({
      asset,
      response: await fetchBounded(new URL(`/assets/${asset}`, baseUrl), { method: "HEAD" })
    }))),
    fetchBounded(new URL(`/assets/release-probe-${Date.now()}.js`, baseUrl)),
    fetchBounded(new URL("/building-vision/", baseUrl), { headers: { "Cache-Control": "no-cache" } })
  ]);
  const missingType = missing.headers.get("content-type") ?? "";
  const missingCache = missing.headers.get("cache-control") ?? "";
  const deepType = deepRoute.headers.get("content-type") ?? "";
  const deepCache = deepRoute.headers.get("cache-control") ?? "";

  for (const { asset, response } of codeResponses) {
    const contentType = response.headers.get("content-type") ?? "";
    const cacheControl = response.headers.get("cache-control") ?? "";
    const expectedType = asset.endsWith(".css") ? "text/css" : /javascript|ecmascript/;
    requireResponse(response.status === 200, `${asset} must return 200.`);
    requireResponse(
      typeof expectedType === "string" ? contentType.includes(expectedType) : expectedType.test(contentType),
      `${asset} has an invalid content type: ${contentType}`
    );
    requireResponse(cacheControl.includes("immutable"), `${asset} must use immutable caching.`);
  }
  requireResponse(missing.status === 404 && !missingType.includes("text/html"), "Missing assets must return a non-HTML 404.");
  requireResponse(missingCache.includes("no-store"), "Missing assets must not be cached.");
  requireResponse(deepRoute.status === 200 && deepType.includes("text/html"), "Deep routes must return HTML 200.");
  requireResponse(deepCache.includes("max-age=0") && deepCache.includes("must-revalidate"), "Deep-route HTML must revalidate.");
}

let lastError;
let verified = false;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    await verifyRelease();
    verified = true;
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 12) await wait(5_000);
  }
}

if (!verified) throw lastError;
console.log(`Live release verified at ${baseUrl.origin}.`);
