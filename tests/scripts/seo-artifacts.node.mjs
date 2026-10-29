import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../../scripts/check-seo-artifacts.mjs", import.meta.url));
const origin = "https://armatureailabs.com";
const routes = ["/", "/about/", "/services/", "/projects/", "/branding/", "/blog/", "/blog/model-hardware-standard/", "/projects/electrofluidic-fiber-muscles/", "/building-vision/", "/ecosystem/", "/components/", "/maker-desk/", "/join/"];
const hash = (html) => createHash("md5").update(html).digest("hex");
const body = (pathname) => `<div id="root" data-prerendered-path="${pathname.replace(/\/+$/, "") || "/"}"><main><h1>Page ${pathname}</h1><p>${"Synthetic public page content for the SEO artifact checker. ".repeat(4)}</p></main></div>`;
const shell = '<html><head><meta name="robots" content="noindex"></head><body><div id="root"></div></body></html>';
const homepage = (pathname) => `<html><head><title>Page ${pathname}</title><link rel="canonical" href="${origin}${pathname}"><meta name="description" content="Synthetic page"><meta name="robots" content="index,follow">${["title", "description", "image", "image:alt", "type", "site_name", "url"].map((key) => `<meta property="og:${key}" content="${key === "url" ? origin + pathname : "Synthetic"}">`).join("")}${["card", "title", "description", "image", "image:alt"].map((key) => `<meta name="twitter:${key}" content="Synthetic">`).join("")}<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{},{},{}]}</script></head><body>${body(pathname)}</body></html>`;

async function check(t, manifest, extra = "") {
  const directory = await mkdtemp(path.join(tmpdir(), "seo-artifacts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const pathname of routes) {
    const filename = path.join(directory, pathname, "index.html");
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, homepage(pathname));
  }
  for (const [filename, pathname] of [["404.html", "/not-found/"], ["members/index.html", "/members/"], ["team/index.html", "/team/"]]) {
    await mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await writeFile(path.join(directory, filename), `<html><head><meta name="robots" content="noindex"></head><body>${body(pathname)}</body></html>`);
  }
  await writeFile(path.join(directory, "app-shell.html"), shell);
  await writeFile(path.join(directory, "sitemap.xml"), `<urlset>${routes.map((route) => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`);
  await writeFile(path.join(directory, "robots.txt"), `User-agent: *\nSitemap: ${origin}/sitemap.xml\n`);
  if (manifest !== null) {
    await writeFile(path.join(directory, "sw.js"), `workbox.precacheAndRoute([${manifest}], {}); workbox.createHandlerBoundToURL("/app-shell"); ${extra}`);
  }
  return spawnSync(process.execPath, [checker, directory], { encoding: "utf8" });
}

const revision = hash(homepage("/"));
const entry = `{url:"index.html",revision:"${revision}"}`;
const appShell = `{url:"app-shell",revision:"${hash(shell)}"}`;

for (const [name, value] of [
  ["minified", entry],
  ["pretty-printed", `{\n  "url": "index.html",\n  "revision": "${revision}"\n}`],
  ["single quotes and reversed keys", `{ revision : '${revision}', url : 'index.html' }`],
  ["mixed whitespace and reversed quoted keys", `{\n'revision'\t:\n"${revision}",\n"url"\n:\t'index.html',\n}`],
]) {
  test(`${name} matching precache entry passes`, async (t) => {
    const result = await check(t, `${value},${appShell}`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SEO artifacts passed/);
  });
}

for (const [name, manifest, error, extra] of [
  ["wrong revision", `{url:'index.html',revision:'wrong'},${appShell}`, /index.html precache revision does not match/],
  ["non-string revision override", `{url:'index.html',revision:'${revision}',revision:null},${appShell}`, /index.html precache revision does not match/],
  ["spread override", `{url:'index.html',revision:'${revision}',...other},${appShell}`, /Expected static precache properties/],
  ["missing entry", appShell, /Expected exactly one index.html precache entry/],
  ["entry outside the manifest", appShell, /Expected exactly one index.html precache entry/, `const unrelated = ${entry};`],
  ["duplicate entries", `${entry},${entry},${appShell}`, /Expected exactly one index.html precache entry/],
  ["duplicate with a different revision", `${entry},{url:'index.html',revision:'wrong'},${appShell}`, /Expected exactly one index.html precache entry/],
  ["missing service worker", null, /sw.js:.*ENOENT/],
  ["wrong app-shell revision", `${entry},{url:'app-shell',revision:'wrong'}`, /app-shell.html precache revision does not match/],
]) {
  test(`${name} fails`, async (t) => {
    const result = await check(t, manifest, extra);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, error);
  });
}
