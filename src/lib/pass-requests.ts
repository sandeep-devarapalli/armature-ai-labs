import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type GuestPass = {
  id: string;
  reference: string;
  visit_date: string;
  purpose: "event" | "meeting";
  details: string;
  status: "pending" | "approved" | "declined" | "alternate" | "checked_in" | "expired";
  offered_date: string | null;
  staff_note: string | null;
  created_at: string;
  checked_in_at: string | null;
  guest_email?: string;
};

export type GoldenApplication = { id: string; details: string; created_at: string; applicant_email?: string };

export const guestPassLabels: Record<GuestPass["status"], string> = {
  pending: "Pending approval", approved: "Approved", declined: "Declined",
  alternate: "New date offered", checked_in: "Checked in", expired: "Expired",
};

export const formatPassDate = (date: string) => new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeZone: "Asia/Kolkata",
}).format(new Date(date.length === 10 ? date + "T12:00:00+05:30" : date));

type PassRpc = "get_my_guest_passes" | "request_guest_pass" | "accept_guest_pass_date" | "staff_list_guest_passes"
  | "staff_update_guest_pass" | "get_my_golden_pass_application" | "submit_golden_pass_application" | "staff_list_golden_pass_applications" | "staff_list_golden_pass_refund_requests";

export async function passRequest<T>(rpc: PassRpc, args?: Record<string, string | null>): Promise<T> {
  const client: SupabaseClient | null = supabase;
  if (!client) throw new Error("Pass requests are unavailable.");
  const { data, error } = await client.rpc(rpc, args);
  if (error) {
    if (error.code === "22023" || error.code === "42501" || error.code === "23505" || error.code === "P0002") throw new Error(error.message);
    throw new Error("We couldn’t load or save this request. Please try again.");
  }
  return data as T;
}
