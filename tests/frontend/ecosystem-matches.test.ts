import { emptyEcosystemListing, type EcosystemListing } from "../../src/lib/ecosystem";
import { findEcosystemMatches, indexEcosystemListings, normalizeEcosystemWebsite } from "../../src/lib/ecosystemMatches";

function listing(name: string, websiteUrl = "", slug = name): EcosystemListing {
  return { slug, revision: 1, data: { ...emptyEcosystemListing(), name, websiteUrl } };
}

it("normalizes case, accents, spacing and site URLs", () => {
  const rows = indexEcosystemListings([listing("Acme Robotics", "https://www.acme.test/")]);
  expect(findEcosystemMatches(rows, { name: "ACMÉ   Robotics" })[0].reason).toBe("Same name");
  expect(findEcosystemMatches(rows, { name: "", websiteUrl: "http://ACME.test/about/" })[0].reason).toBe("Same website or profile");
});

it("matches a careful name prefix or one-letter typo without generic-category matches", () => {
  const rows = indexEcosystemListings([listing("Acme Robotics"), listing("Robotics"), listing("Other Robotics")]);
  expect(findEcosystemMatches(rows, { name: "Acme Robotic" }).map(match => match.listing.data.name)).toEqual(["Acme Robotics"]);
  expect(findEcosystemMatches(rows, { name: "Acme Robotics India" }).map(match => match.listing.data.name)).toEqual(["Acme Robotics"]);
  expect(findEcosystemMatches(rows, { name: "Robotics" })).toEqual([]);
  expect(findEcosystemMatches(rows, { name: "Other Hardware" })).toEqual([]);
  expect(findEcosystemMatches(rows, { name: "Robotics Acme" })).toEqual([]);
});

it("does not match different profiles on a shared platform or a bare platform domain", () => {
  const rows = indexEcosystemListings([listing("Acme", "https://www.linkedin.com/company/acme/"), listing("Beta", "https://lu.ma/beta/")]);
  expect(findEcosystemMatches(rows, { name: "", websiteUrl: "https://linkedin.com/company/other" })).toEqual([]);
  expect(findEcosystemMatches(rows, { name: "", websiteUrl: "https://lu.ma/different" })).toEqual([]);
  expect(findEcosystemMatches(rows, { name: "", websiteUrl: "https://LINKEDIN.com/company/ACME/?tracking=yes" })[0].listing.data.name).toBe("Acme");
  expect(normalizeEcosystemWebsite("https://linkedin.com/")).toBe("");
  expect(normalizeEcosystemWebsite("javascript:alert(1)")).toBe("");
  expect(normalizeEcosystemWebsite("https://user:secret@example.test")).toBe("");
});

it("returns at most five deterministic suggestions and excludes the current listing", () => {
  const rows = indexEcosystemListings(Array.from({ length: 12 }, (_, index) => listing(`Acme Robotics ${index}`, "https://acme.test", String(index))));
  const matches = findEcosystemMatches(rows, { name: "Acme Robotics" }, "0");
  expect(matches).toHaveLength(5);
  expect(matches.some(match => match.listing.slug === "0")).toBe(false);
  expect(findEcosystemMatches(rows, { name: "Acme Robotics" }, "0")).toEqual(matches);
});
