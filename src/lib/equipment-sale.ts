import { supabase } from "./supabase";

export const saleMode = import.meta.env.VITE_EQUIPMENT_SALE_MODE === "test" ? "test" : "live";
export type SaleLine = { code: string; name: string; maker: string | null; pricePaise: number };
export type EquipmentSale = { saleId: string; amountPaise: number; status: string; lines: SaleLine[]; createdAt: string;
  checkedAt: string | null; paymentExpiresAt: string | null; hasOrder: boolean; orderPending: boolean; refundedAmount: number;
  refundApprovedAt: string | null; collectedAt: string | null; declineReason: string | null; reviewReason: string | null; memberId?: string };
export const saleFunction = saleMode === "test" ? "test-equipment-sale" : "equipment-sale";
export async function saleRequest<T>(body: object, expectedMember?: string): Promise<T> {
  if (!supabase) throw new Error("Booking service is unavailable.");
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session || (expectedMember && session.data.session.user.id !== expectedMember)) throw new Error("Your signed-in account changed. Reload the page.");
  const { data, error } = await supabase.functions.invoke(saleFunction, { body, headers: { Authorization: "Bearer " + session.data.session.access_token } });
  if (error || data?.mode !== saleMode) {
    let code = data?.error;
    if (error?.context instanceof Response) try { code = (await error.context.clone().json()).error; } catch { /* Keep provider errors private. */ }
    throw new Error(code === "sale_out_of_stock" ? "This item is out of stock."
      : code === "sale_already_requested" ? "You already have an open request for this item."
      : code === "signed_payment_window_expired" ? "The payment window closed. Ask Armature to reopen it."
      : code === "checkout_disabled" ? "Online buying is not open yet."
      : code === "order_pending_staff_recovery" ? "An order is already being prepared. Ask Armature to recover it before trying again."
      : "The request could not be completed. Check the status or contact Armature before paying again.");
  }
  return data as T;
}
