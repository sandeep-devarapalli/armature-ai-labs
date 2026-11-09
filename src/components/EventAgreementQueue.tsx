import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";
import { eventMode, type EventQuote } from "../lib/event-checkout";
import { rentalMoney as money } from "../lib/rental-checkout";

type Request = EventQuote & { memberId: string };
type Review = EventQuote & { preparedAt?: string | null; paymentWindowAt?: string | null; particulars?: { setupNotes?: string };
  customerEmail?: string; staffEmail?: string; bookingId?: string | null };
const statusLabels: Record<string, string> = { awaiting_staff: "Awaiting staff review", awaiting_signatures: "Awaiting signatures", approved: "Approved for payment",
  awaiting_payment: "Awaiting payment", confirmed: "Event confirmed", completed: "Event completed", needs_review: "Payment needs staff review",
  declined: "Declined", cancelled: "Cancelled", refunded: "Fully refunded" };

// Staff review for event space requests: prepare, decline, approve the signed agreement, reopen payment and cancel.
export function EventAgreementQueue({ client, actorId, blocked, onBusyChange }: {
  client: SupabaseClient; actorId: string; blocked?: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [requests, setRequests] = useState<Request[]>([]), [loaded, setLoaded] = useState(false), [offset, setOffset] = useState(0);
  const [memberId, setMemberId] = useState(""), [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(false), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; if (working.current) onBusyChange(false); }; }, [onBusyChange]);
  async function call(action: string, fields: Record<string, unknown> = {}, member = memberId, pdf?: File) {
    if (working.current || blocked) return;
    working.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      const [session, assurance] = await Promise.all([client.auth.getSession(), client.auth.mfa.getAuthenticatorAssuranceLevel()]);
      if (!active.current) return;
      if (session.error || session.data.session?.user.id !== actorId || !session.data.session.access_token
        || assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("Verify the current Admin session with MFA, then try again.");
      if (action !== "staff_queue" && member === actorId) throw new Error("Another Admin must review your own event request.");
      const payload = { action, ...(action === "staff_queue" ? {} : { memberId: member }), ...fields };
      let body: object | FormData = payload;
      if (pdf) { const upload = new FormData(); upload.set("metadata", JSON.stringify(payload)); upload.set("completedPdf", pdf); body = upload; }
      const { data, error: failure } = await client.functions.invoke(eventMode === "test" ? "test-event-checkout" : "event-checkout", {
        body, headers: { Authorization: `Bearer ${session.data.session.access_token}` } });
      if (!active.current) return;
      if (action === "staff_queue") {
        if (failure || data?.mode !== eventMode || !Array.isArray(data.quotes)) throw new Error("Event requests could not be loaded.");
        setRequests(data.quotes); setOffset(Number(fields.offset ?? 0)); setLoaded(true); return;
      }
      if (failure || data?.mode !== eventMode || data?.quoteId !== fields.quoteId) throw new Error("The action could not be confirmed. Refresh the request before retrying.");
      setMemberId(member);
      setReview(current => current?.quoteId === data.quoteId ? { ...current, ...data } : data);
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "The action could not be completed."); }
    finally { working.current = false; if (active.current) { setBusy(false); onBusyChange(false); } }
  }
  const form = (handler: (fields: FormData) => unknown) => (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void handler(new FormData(event.currentTarget)); };
  const disabled = busy || blocked;
  const quoteId = review?.quoteId;
  return <details className="member-confirm"><summary>Event space requests</summary>
    <p>Check the slot and setup, prepare the agreement in PandaDoc, then approve only the completed document with both signatures and its certificate. Use a separate Admin account with MFA.</p>
    {!review && <MfaPanel mode="supabase" />}
    <button className="button secondary" disabled={disabled} onClick={() => void call("staff_queue", { offset: 0 })}>Load event requests</button>
    {loaded && !requests.length && <p>No event requests in this batch.</p>}
    {loaded && requests.length > 0 && <ul aria-label="Event requests">{requests.map(item => <li key={item.quoteId}>
      <p><strong>{item.date} · {item.startTime}</strong> · {item.hours} h · {item.attendees} guests · {money(item.amountPaise)} · {statusLabels[item.status] ?? item.status}</p>
      <p>{item.purpose}</p>
      <button className="button secondary" disabled={disabled || item.memberId === actorId} onClick={() => void call("manual_review", { quoteId: item.quoteId }, item.memberId)}>
        Review <span className="sr-only">event on {item.date} at {item.startTime}</span></button>
      {item.memberId === actorId && <p>Another Admin must review your own request.</p>}
    </li>)}</ul>}
    {offset > 0 && <button className="button secondary" disabled={disabled} onClick={() => void call("staff_queue", { offset: Math.max(0, offset - 50) })}>Previous batch</button>}
    {requests.length === 50 && <button className="button secondary" disabled={disabled} onClick={() => void call("staff_queue", { offset: offset + 50 })}>Next batch</button>}
    {review && <section aria-label="Event request review">
      <h3>Event space · {review.date} · {review.startTime}, {review.hours} hour{review.hours > 1 ? "s" : ""}</h3>
      <p>{review.attendees} guests · {money(review.amountPaise)}, no GST added.</p><p>Event: {review.purpose}</p>
      <p>Customer: {review.customerEmail}. Armature signer: {review.staffEmail}.</p>
      <p>Status: <strong>{statusLabels[review.status] ?? "Review required"}</strong></p>
      <p>Quote fingerprint: <code style={{ overflowWrap: "anywhere" }}>{review.agreementHash}</code></p>
      {review.status === "awaiting_staff" && <>
        <h4>1. Confirm the slot and setup</h4>
        <form className="ol-form" onSubmit={form(f => void call("prepare", { quoteId, particulars: { availabilityConfirmed: f.get("available") === "on",
          eventDetailsReviewed: f.get("reviewed") === "on", termsVersion: review.policyVersion, setupNotes: String(f.get("setupNotes") ?? "").trim() } }))}>
          <label><input name="available" type="checkbox" required disabled={disabled} /> The slot is free and the lab is open that day.</label>
          <label><input name="reviewed" type="checkbox" required disabled={disabled} /> I reviewed the event, guest count and purpose with the customer.</label>
          <label>Setup notes for the agreement<textarea name="setupNotes" required minLength={10} maxLength={1000} disabled={disabled} /></label>
          <button className="button secondary" disabled={disabled}>Save and prepare agreement</button>
        </form></>}
      {review.status === "awaiting_signatures" && <>
        {review.particulars?.setupNotes && <p>Setup notes: {review.particulars.setupNotes}</p>}
        <h4>2. Approve the signed agreement</h4>
        <p>Include the fingerprint above in the PandaDoc document. After the customer signs and Armature countersigns, upload the completed PDF with its certificate. It is stored privately.</p>
        <form className="ol-form" onSubmit={form(async f => {
          const pdf = f.get("completedPdf");
          if (f.get("agreementHash") !== review.agreementHash) { setError("The fingerprint does not match this request."); return; }
          if (!(pdf instanceof File) || pdf.size < 5 || pdf.size > 20 * 1024 * 1024 || await pdf.slice(0, 5).text() !== "%PDF-") {
            setError("Choose the completed PDF with both signatures and certificate, up to 20 MB."); return; }
          await call("approve_manual", { quoteId, documentId: String(f.get("documentId") ?? "").trim(), agreementHash: review.agreementHash, confirmed: true }, memberId, pdf);
        })}>
          <label>PandaDoc document ID<input name="documentId" required pattern="[A-Za-z0-9_-]{8,80}" disabled={disabled} /></label>
          <label>Fingerprint from the signed agreement<input name="agreementHash" required pattern="[0-9a-f]{64}" disabled={disabled} /></label>
          <label>Completed event PDF with signature certificate<input name="completedPdf" type="file" accept="application/pdf,.pdf" required disabled={disabled} /></label>
          <label><input name="confirmed" type="checkbox" required disabled={disabled} /> I checked both signers, the final terms and this exact request.</label>
          <button className="button" disabled={disabled}>Approve event agreement</button>
        </form></>}
      {review.status === "approved" && <>
        <p>Approved. The customer has 30 minutes from {new Date(review.paymentWindowAt ?? review.approvedAt ?? "").toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST to pay.</p>
        <button className="button secondary" disabled={disabled} onClick={() => void call("reopen_payment", { quoteId })}>Reopen the 30-minute payment window</button>
        <p>Only works after the window has expired, no order exists and the slot is still free.</p></>}
      {review.orderPending && <form className="ol-form" onSubmit={form(f => void call("recover_order", { quoteId, orderId: String(f.get("orderId") ?? "").trim() }))}>
        <h4>Recover the existing order</h4><p>Find the matching receipt in Razorpay. This links the existing order without charging again.</p>
        <label>Existing event order ID<input name="orderId" required pattern="order_[A-Za-z0-9]+" disabled={disabled} /></label>
        <button className="button" disabled={disabled}>Link existing event order</button></form>}
      {["awaiting_staff", "awaiting_signatures", "approved"].includes(review.status) && !review.orderPending && <details><summary>Decline this request</summary>
        <form className="ol-form" onSubmit={form(f => void call("decline", { quoteId, reason: String(f.get("reason") ?? "").trim() }))}>
          <label>Reason shown to the customer<textarea name="reason" required minLength={10} maxLength={1000} disabled={disabled} /></label>
          <button className="button secondary" disabled={disabled}>Decline request</button></form></details>}
      {review.status === "confirmed" && <details><summary>Cancel this confirmed event</summary>
        <p>Cancelling 48 hours or more before the event records a 50% refund due; later, none. Issue any refund in Razorpay separately.</p>
        <form className="ol-form" onSubmit={form(f => void call("cancel", { quoteId, confirmed: true, reason: String(f.get("reason") ?? "").trim() }))}>
          <label>Cancellation reason<textarea name="reason" required minLength={10} maxLength={1000} disabled={disabled} /></label>
          <label><input type="checkbox" required disabled={disabled} /> I confirm cancelling this event for the customer.</label>
          <button className="button secondary" disabled={disabled}>Cancel event</button></form></details>}
      {review.status === "cancelled" && review.refundDuePaise !== null && <p>Refund due: {money(review.refundDuePaise)}.</p>}
      <button className="button secondary" disabled={disabled} onClick={() => void call("manual_review", { quoteId })}>Refresh request</button>
      <button type="button" className="button secondary" disabled={disabled} onClick={() => { setReview(null); setError(""); }}>Close review</button>
    </section>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
