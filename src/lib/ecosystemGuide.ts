import type { EcosystemGuideCategory, EcosystemListingData } from "./ecosystem";
import { isGoogleMapsUrl } from "../../supabase/functions/_shared/ecosystem-validation";

export function listingGoogleMapsUrl(data: EcosystemListingData): string {
  if (data.primaryType === "other" && /people|person|housing/i.test(data.subcategory)) return "";
  return [data.googleMapsUrl, data.sourceUrl, data.websiteUrl].find(value => value && isGoogleMapsUrl(value)) || "";
}

export function listingGuideCategories(data: EcosystemListingData): EcosystemGuideCategory[] {
  if (data.guideCategories?.length) return data.guideCategories;
  const categories: EcosystemGuideCategory[] = [];
  if (/cowork|makerspace|incubat|accelerat|fab lab/i.test(data.subcategory)) categories.push("workspaces");
  if (/community|communit|event/i.test(data.subcategory)) categories.push("communities");
  if (/café|cafe/i.test(data.subcategory)) categories.push("cafes");
  if (data.primaryType === "supplier" || data.primaryType === "vendor" || /makerspace|fab lab/i.test(data.subcategory) || data.needs.some(need => ["source", "manufacture", "test"].includes(need))) categories.push("build-source");
  if (/housing|living|transport|neighbourhood/i.test(data.subcategory)) categories.push("living");
  return categories;
}

export function listingMatchesTopic(data: EcosystemListingData, topic: string): boolean {
  if (!topic) return true;
  if (topic === "startups") return data.primaryType === "startup" || data.alsoListedAs.includes("startup");
  return listingGuideCategories(data).includes(topic as EcosystemGuideCategory);
}
