import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type VentureApplication = {
  id: string;
  firm_name: string;
  firm_type: "independent_vc" | "corporate_venture";
  contact_name: string;
  website: string | null;
  details: string;
  email?: string;
  status: "pending" | "approved" | "declined" | "expired" | "confirmed";
  created_at: string;
  payment_expires_at: string | null;
  confirmed_at: string | null;
  ends_at?: string | null;
};

export const ventureStatuses: Record<VentureApplication["status"], string> = {
  pending: "Under review",
  approved: "Approved · Payment due",
  expired: "Payment window ended",
  confirmed: "Membership confirmed",
  declined: "Application declined",
};

export const ventureFirmTypes = {
  independent_vc: "Independent VC",
  corporate_venture: "Corporate venture team",
};

export const ventureTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
});

type VentureRpc = "submit_venture_pass_application" | "get_my_venture_pass_application"
  | "staff_list_venture_pass_applications" | "staff_review_venture_pass_application";

export async function ventureRequest<T>(name: VentureRpc, args?: Record<string, string | null>): Promise<T> {
  const client: SupabaseClient | null = supabase;
  if (!client) throw new Error("Venture Partner Pass applications are unavailable.");
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (["22023", "42501", "23505", "P0002"].includes(error.code)) throw new Error(error.message);
    throw new Error("We couldn’t load or save this application. Please try again.");
  }
  return data as T;
}

export async function venturePayment(action: "checkout" | "refresh") {
  if (!supabase) throw new Error("Payment is unavailable.");
  const { data, error } = await supabase.functions.invoke<{
    application: VentureApplication | null;
    checkoutUrl?: string;
    confirmationPending?: boolean;
  }>("venture-pass-checkout", { body: action === "checkout" ? { action, acceptedTerms: true } : { action } });
  if (error || !data) throw new Error("We couldn’t verify the payment status. Refresh before attempting payment again.");
  return data;
}
