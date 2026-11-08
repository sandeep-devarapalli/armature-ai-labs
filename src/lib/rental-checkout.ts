import { supabase } from "./supabase";

export const rentalMode = import.meta.env.VITE_RENTAL_CHECKOUT_MODE === "test" ? "test" : "live";
export type RentalQuote = {
  quoteId: string; parentQuoteId?: string | null; product: "cabin101" | "hiwonder"; unit: string; start: string; end: string;
  rentPaise: number; depositPaise: number; amountPaise: number; agreementHash: string; policyVersion: string;
  approvedAt: string | null; preparedAt?: string | null; agreementSigned: boolean; hasOrder: boolean; orderPending: boolean;
  status: string; reviewReason?: string; customerEmail?: string; staffEmail?: string;
};
export const rentalMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
export async function rentalRequest<T>(body: object | FormData, expectedMember?: string): Promise<T> {
  if (!supabase) throw new Error("Booking service is unavailable.");
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session || (expectedMember && session.data.session.user.id !== expectedMember)) throw new Error("Your signed-in account changed. Reload the booking page.");
  const { data, error } = await supabase.functions.invoke(rentalMode === "test" ? "test-rental-checkout" : "rental-checkout", { body, headers: { Authorization: "Bearer " + session.data.session.access_token } });
  if (error || data?.mode !== rentalMode) {
    let code = data?.error;
    if (error?.context instanceof Response) try { code = (await error.context.clone().json()).error; } catch { /* Keep provider errors private. */ }
    throw new Error(code === "staff_mfa_required" ? "Verify your Admin session with MFA first."
      : code === "signed_payment_window_expired" ? "The payment window expired. Ask Armature to review availability and prepare a new agreement."
      : code === "checkout_disabled" ? "New cabin and equipment checkout is not open yet."
      : code === "order_pending_staff_recovery" ? "An order is already being prepared. Ask Armature to recover it before trying again."
      : "The request could not be completed. Check booking status or contact Armature before retrying payment.");
  }
  return data as T;
}
