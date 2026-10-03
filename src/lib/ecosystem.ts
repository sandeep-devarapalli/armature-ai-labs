import type { SupabaseClient } from "@supabase/supabase-js";
import type { EcosystemEntity } from "../data/bengaluruEcosystem";
import { supabase } from "./supabase";

export const ecosystemTypes = ["startup", "research-ecosystem", "supplier", "vendor", "other"] as const;
export type EcosystemPrimaryType = typeof ecosystemTypes[number];
export const ecosystemNeeds = ["build", "source", "manufacture", "test", "learn", "fund", "pilot"] as const;
export type EcosystemNeed = typeof ecosystemNeeds[number];
export const ecosystemCities = ["bangalore"] as const;
export type EcosystemCity = typeof ecosystemCities[number];
export const ecosystemGuideCategories = ["workspaces", "communities", "cafes", "build-source", "living"] as const;
export type EcosystemGuideCategory = typeof ecosystemGuideCategories[number];
export const ecosystemTypeLabels: Record<EcosystemPrimaryType, string> = {
  startup: "Startups & companies", "research-ecosystem": "Research & ecosystem", supplier: "Suppliers", vendor: "Services", other: "Other resources"
};
export interface EcosystemListingData extends EcosystemEntity {
  primaryType: EcosystemPrimaryType;
  alsoListedAs: EcosystemPrimaryType[];
  needs: EcosystemNeed[];
  subcategory: string;
  city?: EcosystemCity;
  guideCategories?: EcosystemGuideCategory[];
  googleMapsUrl?: string;
  publicPhones: { label: string; number: string }[];
  publicEmail: string;
  accessNote: string;
  tips: string;
  engageHow: string;
  salesChannel: string;
  priceLevel: string;
  minOrder: string;
  pricingModel: string;
  turnaround: string;
  credit: { name: string; link: string } | null;
}
export interface EcosystemListing { slug: string; revision: number; data: EcosystemListingData }
export interface EcosystemSubmission {
  id: string;
  kind: "new" | "update";
  target_slug: string | null;
  base_revision: number | null;
  proposal_revision: number;
  base_data: EcosystemListingData | null;
  proposed: EcosystemListingData;
  submitter_name: string | null;
  submitter_email: string | null;
  contacts_permission: boolean;
  status: "pending" | "needs_info" | "rejected" | "approved";
  reviewer_notes: string | null;
  created_at: string;
}
export interface EcosystemContribution {
  idempotencyKey: string;
  kind: "new" | "update";
  targetSlug: string | null;
  baseRevision: number | null;
  proposed: EcosystemListingData;
  submitterName: string;
  submitterEmail: string;
  permissionToShare: boolean;
  creditMe: boolean;
  turnstileToken: string;
  companyFax: string;
}

function client(): SupabaseClient {
  if (!supabase) throw new Error("The ecosystem service is not configured. Please try again later.");
  return supabase;
}

export const ecosystemEditPendingMessage = "An update is awaiting admin review. You can suggest another edit after it is approved or rejected.";
export class EcosystemEditPendingError extends Error {
  constructor() { super(ecosystemEditPendingMessage); this.name = "EcosystemEditPendingError"; }
}

export async function ecosystemEditPending(slug: string): Promise<boolean> {
  const { data, error } = await client().rpc("ecosystem_edit_pending", { p_slug: slug });
  if (error || typeof data !== "boolean") throw new Error("We could not check whether this listing can be edited. Please try again.");
  return data;
}

export async function getEcosystemListings(): Promise<EcosystemListing[]> {
  const listings: EcosystemListing[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client().from("ecosystem_listings").select("slug, revision, data").eq("published", true).order("slug").range(start, start + pageSize - 1);
    if (error) throw new Error("The atlas could not be loaded. Please try again.");
    listings.push(...(data ?? []).map(hydrateEcosystemListing));
    if (!data || data.length < pageSize) return listings;
  }
}

export async function submitEcosystemContribution(input: EcosystemContribution): Promise<string> {
  const { data, error } = await client().functions.invoke("submit-ecosystem", { body: input });
  if (error) {
    const response = error.context;
    if (response instanceof Response && [400, 409, 413, 429, 503].includes(response.status)) {
      const body = await response.clone().json().catch(() => null);
      if (response.status === 409 && body?.code === "edit_pending") throw new EcosystemEditPendingError();
      if (typeof body?.message === "string" && body.message.length > 0 && body.message.length <= 240) throw new Error(`${body.message} Your draft is still here.${response.status === 409 ? " Copy your changes before reloading." : ""}`);
    }
    throw new Error("Your submission was not confirmed. Your draft is still here; please retry.");
  }
  if (typeof data?.receipt !== "string" || !data.receipt || data.saved !== true) throw new Error("Your submission was not confirmed. Please retry.");
  return data.receipt;
}

export async function getEcosystemSubmissions(): Promise<EcosystemSubmission[]> {
  const { data, error } = await client().from("ecosystem_submissions").select("id, kind, target_slug, base_revision, proposal_revision, base_data, proposed, submitter_name, submitter_email, contacts_permission, status, reviewer_notes, created_at").order("created_at", { ascending: false });
  if (error) throw new Error("The review queue could not be loaded.");
  return (data ?? []).map((submission: EcosystemSubmission) => ({ ...submission,
    proposed: { ...emptyEcosystemListing(submission.proposed.primaryType), ...submission.proposed },
    base_data: submission.base_data ? { ...emptyEcosystemListing(submission.base_data.primaryType), ...submission.base_data } : null,
  }));
}

export async function getEcosystemListing(slug: string, publishedOnly = false): Promise<EcosystemListing | null> {
  const query = client().from("ecosystem_listings").select("slug, revision, data").eq("slug", slug);
  const { data, error } = await (publishedOnly ? query.eq("published", true) : query).maybeSingle();
  if (error) throw new Error("The current listing could not be loaded.");
  return data ? hydrateEcosystemListing(data) : null;
}

export function hydrateEcosystemListing(row: EcosystemListing): EcosystemListing {
  return { ...row, data: { ...emptyEcosystemListing(row.data.primaryType), ...row.data, slug: row.slug } };
}

export async function reviewEcosystemSubmission(id: string, decision: "approved" | "needs_info" | "rejected", revision: number | null, notes: string, proposalRevision: number) {
  const { error } = await client().rpc("review_ecosystem_submission", { p_submission_id: id, p_decision: decision, p_expected_revision: revision, p_reviewer_notes: notes, p_expected_proposal_revision: proposalRevision });
  if (error) throw new Error(error.message.includes("stale") ? "This listing changed. Refresh and review the latest differences before approval." : "The review was not saved. Refresh and try again.");
}

export async function rebaseEcosystemSubmission(id: string, revision: number, proposed: EcosystemListingData, proposalRevision: number) {
  const { error } = await client().rpc("rebase_ecosystem_submission", { p_submission_id: id, p_expected_revision: revision, p_proposed: proposed, p_expected_proposal_revision: proposalRevision });
  if (error) throw new Error("The listing changed again or the revised proposal is invalid. Refresh before reviewing.");
}

export function emptyEcosystemListing(primaryType: EcosystemPrimaryType = "startup"): EcosystemListingData {
  return { slug: "", name: "", summary: "", primaryType, entityType: primaryType === "startup" ? "Startup" : "Research & ecosystem", sectors: [], locality: "", websiteUrl: "", sourceUrl: "", locationPrecision: "City-level", confidence: "Medium", locationConfidence: "Medium", provenance: "", verifiedAt: "", alsoListedAs: [], needs: [], subcategory: "", city: "bangalore", guideCategories: [], googleMapsUrl: "", publicPhones: [], publicEmail: "", accessNote: "", tips: "", engageHow: "", salesChannel: "", priceLevel: "", minOrder: "", pricingModel: "", turnaround: "", credit: null };
}

export function changeEcosystemType(data: EcosystemListingData, primaryType: EcosystemPrimaryType): EcosystemListingData {
  return { ...data, primaryType, entityType: primaryType === "startup" ? "Startup" : "Research & ecosystem", subcategory: "", founders: "", engageHow: "", salesChannel: "", priceLevel: "", minOrder: "", pricingModel: "", turnaround: "", alsoListedAs: data.alsoListedAs.filter((type) => type !== primaryType) };
}

export function ecosystemChanges(base: EcosystemListingData | null, proposed: EcosystemListingData) {
  return [...new Set([...Object.keys(base ?? {}), ...Object.keys(proposed)])].filter((key) => JSON.stringify(base?.[key as keyof EcosystemListingData] ?? null) !== JSON.stringify(proposed[key as keyof EcosystemListingData] ?? null)) as (keyof EcosystemListingData)[];
}
