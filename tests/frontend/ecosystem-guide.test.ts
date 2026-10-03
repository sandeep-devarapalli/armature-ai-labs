import { emptyEcosystemListing } from "../../src/lib/ecosystem";
import { listingGoogleMapsUrl, listingGuideCategories, listingMatchesTopic } from "../../src/lib/ecosystemGuide";

it("keeps legacy makerspaces discoverable in both working and building topics", () => {
  const data = { ...emptyEcosystemListing("research-ecosystem"), subcategory: "Makerspace" };
  expect(listingGuideCategories(data)).toEqual(["workspaces", "build-source"]);
  expect(listingMatchesTopic(data, "build-source")).toBe(true);
  expect(listingGuideCategories({ ...data, guideCategories: ["living"] })).toEqual(["living"]);
});

it("uses an already approved Maps source without inventing a map destination", () => {
  const data = { ...emptyEcosystemListing(), sourceUrl: "https://maps.app.goo.gl/XeNziZfx3V8S8jza7" };
  expect(listingGoogleMapsUrl(data)).toBe(data.sourceUrl);
  expect(listingGoogleMapsUrl({ ...data, sourceUrl: "https://example.test/maps" })).toBe("");
  expect(listingGoogleMapsUrl({ ...data, primaryType: "other", subcategory: "Housing" })).toBe("");
});
