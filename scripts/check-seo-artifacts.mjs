import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";

const directory = path.resolve(process.argv[2] ?? "dist");
const origin = "https://armatureailabs.com";
const excluded = /^\/(?:admin|auth|dashboard|profile|book|bookings|check-in|financials|kiosk|inventory|lockers|consumables|toolkits|component-requests|members|membership|equipment|procurement)(?:\/|$)|^\/components\/request\//;
const failures = [];
const titles = new Set();
const headings = new Set();
const canonicals = new Set();

function requiredMeta(document, selector) {
  const elements = document.head.querySelectorAll(selector);
  assert.equal(elements.length, 1, `Expected exactly one ${selector}`);
  const value = elements[0].getAttribute("content")?.trim();
  assert.ok(value, `Empty ${selector}`);
  return value;
}

function checkBody(document, pathname) {
  const root = document.querySelector("#root");
  const main = root?.querySelector("main");
  assert.ok(main, "No server-rendered main content");
  assert.equal(main.querySelectorAll("h1").length, 1, "Expected one main H1");
  assert.ok(main.querySelector("h1").textContent.trim(), "Empty H1");
  assert.ok(main.textContent.replace(/\s+/g, " ").trim().length > 120, "Main is empty or only a loading shell");
  assert.equal(root.getAttribute("data-prerendered-path"), pathname.replace(/\/+$/, "") || "/");
}

const sitemap = new JSDOM(await readFile(path.join(directory, "sitemap.xml"), "utf8"), { contentType: "application/xml" });
const urls = [...sitemap.window.document.querySelectorAll("url > loc")].map((node) => node.textContent.trim());
sitemap.window.close();
assert.ok(urls.length >= 13, "Sitemap is missing public pages or catalog entries");
assert.equal(new Set(urls).size, urls.length, "Sitemap contains duplicates");
for (const pathname of ["/", "/about/", "/services/", "/projects/", "/branding/", "/blog/", "/blog/model-hardware-standard/", "/projects/electrofluidic-fiber-muscles/", "/building-vision/", "/ecosystem/", "/components/", "/maker-desk/", "/join/"]) {
  assert.ok(urls.includes(`${origin}${pathname}`), `Sitemap is missing ${pathname}`);
}

for (const url of urls) {
  let dom;
  try {
    const parsed = new URL(url);
    assert.equal(parsed.origin, origin, "Wrong canonical origin");
    assert.equal(parsed.search + parsed.hash, "", "Sitemap includes a query or hash");
    assert.match(parsed.pathname, /^\/(?:[a-z0-9-]+\/)*$/, "Public canonical needs a trailing slash and safe path");
    assert.ok(!excluded.test(parsed.pathname), "Private, retired or alias URL is in sitemap");
    const filename = path.join(directory, parsed.pathname, "index.html");
    dom = new JSDOM(await readFile(filename, "utf8"));
    const document = dom.window.document;
    checkBody(document, parsed.pathname);
    const heading = document.querySelector("main h1").textContent.trim();
    assert.ok(!headings.has(heading), "Duplicate public H1 suggests a fallback page was copied into this route");
    headings.add(heading);
    assert.equal(document.head.querySelectorAll("title").length, 1, "Expected exactly one title");
    assert.ok(document.title.trim() && !titles.has(document.title), "Missing or duplicate title");
    titles.add(document.title);
    const canonical = document.head.querySelectorAll('link[rel="canonical"]');
    assert.equal(canonical.length, 1, "Expected exactly one canonical");
    assert.equal(canonical[0].getAttribute("href"), url, "Canonical does not match sitemap");
    assert.ok(!canonicals.has(url), "Duplicate canonical");
    canonicals.add(url);
    requiredMeta(document, 'meta[name="description"]');
    assert.doesNotMatch(requiredMeta(document, 'meta[name="robots"]'), /noindex/i);
    for (const key of ["title", "description", "image", "image:alt", "type", "site_name", "url"]) {
      requiredMeta(document, `meta[property="og:${key}"]`);
    }
    assert.equal(requiredMeta(document, 'meta[property="og:url"]'), url);
    for (const key of ["card", "title", "description", "image", "image:alt"]) {
      requiredMeta(document, `meta[name="twitter:${key}"]`);
    }
    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    assert.equal(scripts.length, 1, "Expected one structured-data graph");
    const schema = JSON.parse(scripts[0].textContent);
    assert.equal(schema["@context"], "https://schema.org");
    assert.ok(Array.isArray(schema["@graph"]) && schema["@graph"].length >= 3, "Structured graph is missing identity/page nodes");
  } catch (error) {
    failures.push(`${url}: ${error.message}`);
  } finally {
    dom?.window.close();
  }
}

for (const filename of ["app-shell.html", "404.html", "members/index.html", "team/index.html"]) {
  let dom;
  try {
    dom = new JSDOM(await readFile(path.join(directory, filename), "utf8"));
    const document = dom.window.document;
    assert.match(requiredMeta(document, 'meta[name="robots"]'), /noindex/i);
    assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 0, "Nonindexable page has a public canonical");
    assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 0, "Nonindexable page has public schema");
    if (filename === "app-shell.html") {
      assert.equal(document.querySelector("#root")?.childNodes.length, 0, "Operational shell contains prerendered private data");
    } else {
      checkBody(document, filename === "404.html" ? "/not-found/" : filename === "team/index.html" ? "/team/" : "/members/");
    }
  } catch (error) {
    failures.push(`${filename}: ${error.message}`);
  } finally {
    dom?.window.close();
  }
}

try {
  const robots = await readFile(path.join(directory, "robots.txt"), "utf8");
  assert.doesNotMatch(robots, /<html|<!doctype/i, "robots.txt is an HTML fallback");
  assert.match(robots, /^User-agent:\s*\*\s*$/im);
  assert.match(robots, /^Sitemap:\s*https:\/\/armatureailabs\.com\/sitemap\.xml\s*$/im);
} catch (error) {
  failures.push(`robots.txt: ${error.message}`);
}

try {
  const serviceWorker = await readFile(path.join(directory, "sw.js"), "utf8");
  for (const filename of ["index.html", "app-shell.html"]) {
    const revision = createHash("md5").update(await readFile(path.join(directory, filename))).digest("hex");
    const precacheUrl = filename === "app-shell.html" ? "app-shell" : filename;
    assert.ok(serviceWorker.includes(`url:"${precacheUrl}",revision:"${revision}"`), `${filename} precache revision does not match the final HTML`);
  }
  assert.ok(serviceWorker.includes('createHandlerBoundToURL("/app-shell")'), "SPA navigation must not display home-page HTML on other routes");
} catch (error) {
  failures.push(`sw.js: ${error.message}`);
}

if (failures.length) {
  console.error(`SEO artifact check failed (${failures.length}):\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`SEO artifacts passed: ${urls.length} initial-HTML public pages, unique titles/canonicals, metadata/schema, noindex shells and robots/sitemap.`);
}
