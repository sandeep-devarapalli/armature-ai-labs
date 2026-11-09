import { supabase } from "./supabase";

export const eventMode = import.meta.env.VITE_EVENT_CHECKOUT_MODE === "test" ? "test" : "live";
export type EventAvailability = { date: string; ratePaise: number; opens: string; closes: string; bufferMinutes: number;
  maxAttendees: number; closed: boolean; busy: { start: string; end: string }[] };
export type EventQuote = { quoteId: string; date: string; startTime: string; hours: number; attendees: number; purpose: string;
  startsAt: string; endsAt: string; rentPaise: number; amountPaise: number; agreementHash: string; policyVersion: string;
  approvedAt: string | null; hasAgreement: boolean; hasOrder: boolean; orderPending: boolean; refundDuePaise: number | null;
  declineReason: string | null; status: string };
export async function eventRequest<T>(body: object, expectedMember?: string): Promise<T> {
  if (!supabase) throw new Error("Booking service is unavailable.");
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session || (expectedMember && session.data.session.user.id !== expectedMember)) throw new Error("Your signed-in account changed. Reload the booking page.");
  const { data, error } = await supabase.functions.invoke(eventMode === "test" ? "test-event-checkout" : "event-checkout", { body, headers: { Authorization: "Bearer " + session.data.session.access_token } });
  if (error || data?.mode !== eventMode) {
    let code = data?.error;
    if (error?.context instanceof Response) try { code = (await error.context.clone().json()).error; } catch { /* Keep provider errors private. */ }
    throw new Error(code === "event_slot_unavailable" ? "That time is already booked. Choose another start time or date."
      : code === "signed_payment_window_expired" ? "The payment window expired. Ask Armature to reopen payment for this event."
      : code === "checkout_disabled" ? "Event booking is not open yet."
      : code === "order_pending_staff_recovery" ? "An order is already being prepared. Ask Armature to recover it before trying again."
      : "The request could not be completed. Check booking status or contact Armature before retrying payment.");
  }
  return data as T;
}
