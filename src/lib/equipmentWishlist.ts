import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const wishlistStatuses = ["open", "under_review", "planned", "ordered", "available", "deferred", "not_proceeding"] as const;
export type WishlistStatus = typeof wishlistStatuses[number];
export interface EquipmentWish {
  id: string; component_name: string; project_use_case: string; vendor_url: string | null;
  requested_quantity: number; budget_band: string; wishlist_category: string; wishlist_model: string | null;
  wishlist_status: WishlistStatus; created_at: string; vote_count: number; has_image?: boolean; public_note?: string | null; linked_component_slug?: string | null;
}
export interface PrivateEquipmentWish extends EquipmentWish { is_published: boolean; decision_note: string | null; merged_into: string | null; image_path?: string | null }
const client = () => { if (!supabase) throw new Error("The equipment wishlist is not connected yet."); return supabase as SupabaseClient; };
export const wishlistImageUrl = (id: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/equipment-wishlist-image?request_id=${encodeURIComponent(id)}`;
export async function listEquipmentWishes(page = 0, search = "", status = "", category = "", sort = "votes", requestId = "") {
  let query = client().from("public_equipment_wishlist").select("*", { count: "exact" });
  query = sort === "newest" ? query.order("created_at", { ascending: false }).order("id") : query.order("vote_count", { ascending: false }).order("created_at").order("id");
  if (category) query = query.eq("wishlist_category", category);
  if (requestId) query = query.eq("id", requestId);
  const term = search.trim().replace(/[^\p{L}\p{N}\s-]/gu, "");
  if (term) query = query.or(`component_name.ilike.%${term}%,wishlist_model.ilike.%${term}%,wishlist_category.ilike.%${term}%`);
  if (status) query = query.eq("wishlist_status", status);
  const result = await query.range(page * 20, page * 20 + 19);
  if (result.error) throw result.error;
  return { rows: (result.data ?? []) as EquipmentWish[], count: result.count ?? 0 };
}
export async function listPrivateEquipmentWishes(_userId: string, admin = false, page = 0) {
  let query = client().from(admin ? "component_requests" : "my_equipment_wishlist").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (admin) query = query.eq("request_scope", "equipment_wishlist");
  const result = await query.range(page * 20, page * 20 + 19);
  if (result.error) throw result.error;
  return { rows: (result.data ?? []) as PrivateEquipmentWish[], count: result.count ?? 0 };
}
export async function listMyWishVotes(userId: string) {
  const result = await client().from("component_request_votes").select("request_id").eq("member_id", userId);
  if (result.error) throw result.error;
  return (result.data ?? []).map(row => row.request_id as string);
}
export async function wishRpc(name: "submit_equipment_wish" | "vote_component_request" | "moderate_equipment_wish" | "merge_equipment_wishes" | "edit_equipment_wish", args: Record<string, unknown>) {
  const result = await client().rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
export async function uploadWishImage(id: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPEG, PNG or WebP image up to 5 MB.");
  const session = await client().auth.getSession();
  if (!session.data.session) throw new Error("Sign in again before uploading an image.");
  const result = await fetch(wishlistImageUrl(id), { method: "POST", headers: { Authorization: `Bearer ${session.data.session.access_token}`, "Content-Type": file.type, "x-image-rights": "confirmed" }, body: file });
  if (!result.ok) { const data = await result.json().catch(() => null); throw new Error(data?.error ?? "Your request is saved, but the image could not be accepted. Retry below."); }
}

export async function readPrivateWishImage(id: string, signal: AbortSignal) {
  const session = await client().auth.getSession();
  if (!session.data.session) throw new Error("Sign in to review this image.");
  const result = await fetch(wishlistImageUrl(id), { signal, headers: { Authorization: `Bearer ${session.data.session.access_token}` } });
  if (!result.ok) throw new Error("Reference image unavailable.");
  return result.blob();
}

export async function resolveMergedWish(id: string) {
  const result = await client().from("public_equipment_wishlist_redirects").select("merged_into").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.merged_into as string | undefined;
}
export async function wishlistCatalogue() {
  const result = await client().from("components").select("slug,name").order("name");
  if (result.error) throw result.error;
  return (result.data ?? []) as { slug: string; name: string }[];
}
