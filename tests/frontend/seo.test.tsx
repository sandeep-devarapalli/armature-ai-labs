import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { PageMetadata } from "../../src/components/PageMetadata";
import { getPageSeo, publicSeoPaths, renderSeoHead, SITE_URL } from "../../src/lib/seo";
import { components } from "../../src/data/components";
import article from "../../src/data/blogArticle.md?raw";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-seo], [data-seo-test]").forEach((node) => node.remove());
});

describe("search metadata", () => {
  it("has unique public titles, descriptions and canonical URLs for the complete static catalog", () => {
    expect(publicSeoPaths).toHaveLength(13 + components.length);
    expect(new Set(publicSeoPaths).size).toBe(publicSeoPaths.length);
    const pages = publicSeoPaths.map(getPageSeo);
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.description)).size).toBe(pages.length);
    for (const path of publicSeoPaths) {
      const page = getPageSeo(path);
      expect(path).toMatch(/^\/.*\/$|^\/$/);
      expect(page.indexable).toBe(true);
      expect(page.canonical).toBe(`${SITE_URL}${path}`);
      expect(page.structuredData).toBeDefined();
      expect(page.description).not.toMatch(/available now|book now|installed|in stock/i);
    }
  });

  it("canonicalizes public route variants and filters without indexing new query pages", () => {
    for (const path of ["/blog", "/blog/", "/blog/?q=MHS#journal"]) {
      expect(getPageSeo(path).canonical).toBe(`${SITE_URL}/blog/`);
    }
    expect(getPageSeo("/components/?project=weather-station").canonical).toBe(`${SITE_URL}/components/`);
    expect(getPageSeo("/ecosystem/?focus=some-company").canonical).toBe(`${SITE_URL}/ecosystem/`);
  });

  it.each([
    "/admin", "/admin/members", "/financials", "/auth", "/auth/callback", "/dashboard", "/profile",
    "/book", "/book/some-resource", "/bookings/123", "/check-in", "/inventory", "/kiosk",
    "/lockers", "/consumables", "/toolkits", "/component-requests", "/components/request",
    "/members", "/members/someone", "/team", "/procurement", "/missing-page", "/components/not-a-component"
  ])("keeps %s out of the public index and schema", (path) => {
    const page = getPageSeo(path);
    expect(page.indexable).toBe(false);
    expect(page.robots).toBe("noindex, follow");
    expect(page.canonical).toBeUndefined();
    expect(page.structuredData).toBeUndefined();
    expect(publicSeoPaths).not.toContain(`${path}/`);
  });

  it("uses existing branding, pre-launch facts and the visible article's organization and dates", () => {
    const home = getPageSeo("/");
    expect(home.description).toContain("planned");
    expect(getPageSeo("/join/").description).toContain("pre-launch");
    expect(getPageSeo("/about/").image).toBe(`${SITE_URL}/about/who-we-are-social.png`);
    const articleSeo = getPageSeo("/blog/model-hardware-standard/");
    expect(articleSeo.image).toBe(`${SITE_URL}/blog-covers/mhs-common-interface.png`);
    expect([articleSeo.imageWidth, articleSeo.imageHeight]).toEqual([1672, 941]);
    expect(existsSync(`public${new URL(home.image).pathname}`)).toBe(true);
    const graph = getPageSeo("/blog/model-hardware-standard/").structuredData!["@graph"] as Record<string, unknown>[];
    const organization = graph.find((item) => item["@type"] === "Organization")!;
    expect(organization.email).toBe("hello@armatureailabs.com");
    expect(organization.telephone).toBe("+919748485583");
    expect(organization).not.toHaveProperty("openingHours");
    expect(existsSync(`public${new URL(organization.logo as string).pathname}`)).toBe(true);
    const post = graph.find((item) => item["@type"] === "BlogPosting")!;
    expect(post.image).toEqual({ "@type": "ImageObject", url: articleSeo.image, width: 1672, height: 941 });
    expect(post.headline).toBe(article.split("\n", 1)[0].replace(/^# /, ""));
    expect(post.datePublished).toBe("2026-09-13");
    expect(post.dateModified).toBe("2026-09-17");
    expect(article).toContain("Updated — 17 September 2026");
    expect(post.author).toEqual({ "@id": `${SITE_URL}/#organization` });
    expect(JSON.stringify(graph)).not.toMatch(/AggregateRating|openingHours|Product|Offer/);
  });

  it("escapes HTML and script boundaries while preserving machine-readable JSON", () => {
    const source = getPageSeo("/");
    source.title = '<script>alert("title")</script>';
    source.description = '" & <description>';
    source.structuredData = { name: "</script><script>alert('schema')</script>" };
    const document = new DOMParser().parseFromString(renderSeoHead(source), "text/html");
    expect(document.title).toBe(source.title);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(source.description);
    expect(document.querySelectorAll("script")).toHaveLength(1);
    expect(JSON.parse(document.querySelector("script")!.textContent!)).toEqual(source.structuredData);
  });

  it("replaces prerendered metadata on SPA navigation without duplicates or stale private schema", async () => {
    document.head.insertAdjacentHTML("beforeend", renderSeoHead(getPageSeo("/")));
    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#111110";
    theme.dataset.seoTest = "true";
    document.head.appendChild(theme);
    render(<MemoryRouter><PageMetadata /><Link to="/blog/">Journal</Link><Link to="/admin/">Admin</Link></MemoryRouter>);
    fireEvent.click(screen.getByText("Journal"));
    await waitFor(() => expect(document.title).toBe(getPageSeo("/blog/").title));
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[property="og:url"]')).toHaveAttribute("content", `${SITE_URL}/blog/`);
    fireEvent.click(screen.getByText("Admin"));
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow"));
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(document.head.querySelector('[data-seo-test]')).toHaveAttribute("content", "#111110");
  });
});
