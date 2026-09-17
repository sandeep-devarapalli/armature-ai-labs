import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const base = new URL(process.argv[2] ?? "https://armatureailabs.com");
assert.ok(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "Use an HTTP(S) site origin without credentials");
assert.equal(base.pathname, "/", "Use the site origin, not a subdirectory");
const canonicalOrigin = "https://armatureailabs.com";
const failures = [];
let count = 0;

async function probe(pathname, check) {
  let dom;
  try {
    const response = await fetch(new URL(pathname, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "ArmatureSEOReadinessCheck/1.0", Accept: "text/html,application/xml,text/plain" }
    });
    const text = await response.text();
    assert.ok(text.length < 3_000_000, "Unexpectedly large response");
    if (response.headers.get("content-type")?.includes("text/html")) dom = new JSDOM(text);
    check(response, text, dom?.window.document);
    console.log(`SEO HTTP passed: ${response.status} ${pathname}`);
  } catch (error) {
    failures.push(`${pathname}: ${error.message}`);
  } finally {
    dom?.window.close();
    count += 1;
  }
}

function noindex(response, document) {
  assert.ok(document, "Expected an HTML document");
  const directives = `${response.headers.get("x-robots-tag") ?? ""} ${document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? ""}`;
  assert.match(directives, /noindex/i, "Missing noindex directive");
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 0, "Nonindexable page has a public canonical");
  assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 0, "Nonindexable page contains public schema");
}

for (const pathname of ["/", "/blog/", "/blog/model-hardware-standard/", "/building-vision/", "/components/weather-pico-w-controller/"]) {
  await probe(pathname, (response, text, document) => {
    assert.equal(response.status, 200, "Public page must return 200 directly");
    assert.ok(document, "Expected text/html");
    assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1);
    assert.equal(document.querySelector('link[rel="canonical"]').getAttribute("href"), `${canonicalOrigin}${pathname}`);
    assert.ok(document.title.trim(), "Missing title");
    assert.ok(document.querySelector('meta[name="description"]')?.getAttribute("content"), "Missing description");
    assert.doesNotMatch(`${response.headers.get("x-robots-tag") ?? ""} ${document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? ""}`, /noindex/i);
    const main = document.querySelector("#root main");
    assert.ok(main?.textContent.replace(/\s+/g, " ").trim().length > 120, "Missing meaningful initial main content");
    assert.equal(main.querySelectorAll("h1").length, 1);
    assert.equal(document.querySelector("#root").getAttribute("data-prerendered-path"), pathname.replace(/\/+$/, "") || "/");
  });
}

for (const pathname of ["/__seo-check-missing__/", "/procurement/", "/components/__seo-check-missing__/", "/auth/not-a-route/"]) {
  await probe(pathname, (response, text, document) => {
    assert.equal(response.status, 404, "Unknown/retired path must return a real 404");
    noindex(response, document);
    assert.ok(document.querySelector("main h1")?.textContent.trim(), "404 page is missing its rendered heading");
  });
}

for (const [pathname, destination, search] of [["/membership/", "/join/", ""], ["/equipment/", "/", ""], ["/membership?source=a", "/join/", "?source=a"]]) {
  await probe(pathname, (response) => {
    assert.equal(response.status, 301, "Retired alias needs a permanent server redirect");
    const location = new URL(response.headers.get("location"), base);
    assert.equal(location.pathname, destination, "Redirect has the wrong destination");
    assert.equal(location.search, search, "Redirect did not preserve the query string");
    assert.ok([base.origin, canonicalOrigin].includes(location.origin), "Redirect points to an unrelated site");
  });
}

for (const pathname of ["/auth/", "/admin/members/", "/book/sample-resource/", "/components/request/", "/members/", "/members/seo-check-no-profile/"]) {
  await probe(pathname, (response, text, document) => {
    assert.equal(response.status, 200, "Known operational/member route should remain reachable");
    noindex(response, document);
    if (pathname !== "/members/") {
      assert.equal(document.querySelector("#root")?.childNodes.length, 0, "Operational route contains prerendered private state");
      assert.equal(document.querySelector("#root")?.getAttribute("data-prerendered-path"), null);
    }
  });
}

await probe("/robots.txt", (response, text) => {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  assert.match(text, /^Sitemap:\s*https:\/\/armatureailabs\.com\/sitemap\.xml\s*$/im);
  assert.doesNotMatch(text, /<html|<!doctype/i);
});
await probe("/sitemap.xml", (response, text) => {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /xml/);
  const xml = new JSDOM(text, { contentType: "application/xml" });
  try {
    const urls = [...xml.window.document.querySelectorAll("loc")].map((node) => new URL(node.textContent.trim()));
    assert.ok(urls.length >= 13, "Sitemap is missing public content");
    for (const url of urls) {
      assert.equal(url.origin, canonicalOrigin);
      assert.doesNotMatch(url.pathname, /^\/(?:admin|auth|dashboard|profile|book|bookings|check-in|financials|kiosk|inventory|lockers|consumables|toolkits|component-requests|members|membership|equipment|procurement)(?:\/|$)|^\/components\/request\//);
    }
  } finally {
    xml.window.close();
  }
});

if (failures.length) {
  console.error(`SEO HTTP check failed (${failures.length}/${count} probes):\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`SEO HTTP readiness passed: ${count} bounded probes at ${base.origin}.`);
}
