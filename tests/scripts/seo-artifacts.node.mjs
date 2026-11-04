import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legalEntity } from "../../src/data/legalEntity.ts";

const checker = fileURLToPath(new URL("../../scripts/check-seo-artifacts.mjs", import.meta.url));
const origin = "https://armatureailabs.com";
const legalPages = {
  "/contact/": "Contact Us",
  "/terms/": "Terms and Conditions",
  "/refund-policy/": "Cancellation and Refund Policy",
  "/shipping-policy/": "Shipping and Delivery Policy",
  "/privacy/": "Your information, handled with care."
};
const routes = ["/", "/about/", "/services/", "/projects/", "/branding/", "/blog/", "/blog/model-hardware-standard/", "/projects/electrofluidic-fiber-muscles/", "/building-vision/", "/ecosystem/", "/components/", "/maker-desk/", "/join/", ...Object.keys(legalPages)];
const hash = (html) => createHash("md5").update(html).digest("hex");
const footer = `<footer><p>${legalEntity.labAddress.formatted}</p>${Object.keys(legalPages).map((route) => `<a href="${route.slice(0, -1)}">${legalPages[route]}</a>`).join("")}</footer>`;
const body = (pathname) => `<div id="root" data-prerendered-path="${pathname.replace(/\/+$/, "") || "/"}"><div class="app-shell"><main><h1>${legalPages[pathname] ?? `Page ${pathname}`}</h1><p>${legalPages[pathname] ? `${legalEntity.name}. ` : ""}${"Synthetic public page content for the SEO artifact checker. ".repeat(4)}</p></main>${footer}</div></div>`;
const shell = '<html><head><meta name="robots" content="noindex"></head><body><div id="root"></div></body></html>';
const schema = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", address: {
  "@type": "PostalAddress", streetAddress: `${legalEntity.labAddress.street}, ${legalEntity.labAddress.locality}`,
  addressLocality: legalEntity.labAddress.city, addressRegion: legalEntity.labAddress.state,
  postalCode: legalEntity.labAddress.postalCode, addressCountry: legalEntity.labAddress.country
} }, {}, {}] };
const homepage = (pathname) => `<html><head><title>Page ${pathname}</title><link rel="canonical" href="${origin}${pathname}"><meta name="description" content="Synthetic page"><meta name="robots" content="index,follow">${["title", "description", "image", "image:alt", "type", "site_name", "url"].map((key) => `<meta property="og:${key}" content="${key === "url" ? origin + pathname : "Synthetic"}">`).join("")}${["card", "title", "description", "image", "image:alt"].map((key) => `<meta name="twitter:${key}" content="Synthetic">`).join("")}<script type="application/ld+json">${JSON.stringify(schema)}</script></head><body>${body(pathname)}</body></html>`;

async function check(t, manifest, extra = "", files = {}) {
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
  for (const [filename, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await writeFile(path.join(directory, filename), content);
  }
  return spawnSync(process.execPath, [checker, directory], { encoding: "utf8" });
}

for (const [name, html, error] of [
  ["missing policy entity", homepage("/terms/").replace(`${legalEntity.name}. `, ""), /Policy is missing the legal entity/],
  ["wrong policy heading", homepage("/terms/").replace("<h1>Terms and Conditions</h1>", "<h1>Not the approved policy</h1>"), /Wrong policy heading/],
  ["missing legal footer", homepage("/terms/").replace(footer, `<footer><p>${legalEntity.labAddress.formatted}</p></footer>`), /Footer is missing \/contact\//],
  ["nested footer cannot supply missing shared footer links", homepage("/terms/").replace(footer, `<footer><p>${legalEntity.labAddress.formatted}</p></footer>`).replace("</main>", `${footer}</main>`), /Footer is missing \/contact\//],
  ["nested footer cannot supply a missing shared footer address", homepage("/terms/").replace(legalEntity.labAddress.formatted, "A different address").replace("</main>", `${footer}</main>`), /Footer is missing the current lab address/],
  ["nested footer cannot replace the shared footer", homepage("/terms/").replace(footer, "").replace("</main>", `${footer}</main>`), /Missing shared site footer/],
  ["wrong footer address", homepage("/terms/").replace(legalEntity.labAddress.formatted, "A different address"), /Footer is missing the current lab address/],
  ["wrong structured address", homepage("/terms/").replace(`"addressLocality":"${legalEntity.labAddress.city}"`, '"addressLocality":"A different city"'), /PostalAddress addressLocality must match/]
]) {
  test(`${name} fails`, async (t) => {
    const result = await check(t, `${entry},${appShell}`, "", { "terms/index.html": html });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, error);
  });
}

test("nested content footer before the shared footer passes", async (t) => {
  const html = homepage("/terms/").replace("</main>", "<footer><p>Nested content note</p></footer></main>");
  const result = await check(t, `${entry},${appShell}`, "", { "terms/index.html": html });
  assert.equal(result.status, 0, result.stderr);
});

test("missing policy sitemap route fails", async (t) => {
  const sitemap = `<urlset>${routes.filter((route) => route !== "/terms/").map((route) => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`;
  const result = await check(t, `${entry},${appShell}`, "", { "sitemap.xml": sitemap });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Sitemap is missing \/terms\//);
});

for (const [name, filename, content, error] of [
  ["old PIN in a JavaScript asset", "assets/old-address.js", 'const oldAddress = "560034";', /Superseded lab address in assets\/old-address.js/],
  ["old road in unlisted HTML", "old-address.html", "<p>20th Main, HSR Layout</p>", /Superseded lab address in old-address.html/],
  ["wrong structured address outside the sitemap", "extra.html", `<script type="application/ld+json">${JSON.stringify(schema).replace(`"addressLocality":"${legalEntity.labAddress.city}"`, '"addressLocality":"A different city"')}</script>`, /PostalAddress addressLocality must match/]
]) {
  test(`${name} fails`, async (t) => {
    const result = await check(t, `${entry},${appShell}`, "", { [filename]: content });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, error);
  });
}

test("CAD and binary model data are outside the web-copy address scan", async (t) => {
  const result = await check(t, `${entry},${appShell}`, "", {
    "building-models/source.step": "#560034 = CARTESIAN_POINT('',(20,0,0));",
    "building-models/source.glb": Buffer.from("\0\xff560034")
  });
  assert.equal(result.status, 0, result.stderr);
});

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
