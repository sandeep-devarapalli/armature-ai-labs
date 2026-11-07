import { useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";

type Review = {
  quoteId: string;
  agreementHash: string;
  chair: string;
  start: string;
  end: string;
  amountPaise: number;
  customerEmail: string;
  staffEmail: string;
  agreementSigned?: boolean;
  policyVersion?: string;
};

const quoteReference = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export function ManualDeskAgreementReview({ client, memberId, blocked, mode = "live" }: {
  client: SupabaseClient;
  memberId: string;
  blocked?: boolean;
  mode?: "test" | "live";
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || working.current) return;
    const form = new FormData(event.currentTarget);
    const quoteId = review?.quoteId ?? String(form.get("quoteId")).trim().toLowerCase();
    working.current = true;
    setBusy(true);
    setError("");
    try {
      let body: object = { action: "manual_review", memberId, quoteId };
      if (review) {
        if (review.agreementSigned || form.get("confirmed") !== "on") return;
        const pdf = form.get("certificate");
        if (!(pdf instanceof File) || pdf.size === 0 || pdf.size > 20 * 1024 * 1024 ||
          await pdf.slice(0, 5).text() !== "%PDF-") {
          throw new Error("Choose the completed PandaDoc PDF, up to 20 MB.");
        }
        const digest = await crypto.subtle.digest("SHA-256", await pdf.arrayBuffer());
        const evidenceSha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        body = {
          action: "approve_manual", memberId, quoteId,
          documentId: String(form.get("documentId")).trim(),
          agreementHash: String(form.get("agreementHash")).trim().toLowerCase(),
          evidenceSha256, confirmed: true,
        };
      }
      const { data, error: failure } = await client.functions.invoke("desk-checkout", { body });
      if (failure || data?.mode !== mode || data?.quoteId !== quoteId) {
        let code = data?.error;
        if (failure?.context instanceof Response) {
          try { code = (await failure.context.clone().json()).error; } catch { /* Unexpected errors use the generic message. */ }
        }
        throw new Error(code === "staff_mfa_required"
          ? "Verify this admin session with MFA before reviewing agreements."
          : "This pilot agreement could not be processed. Check the reference and review the latest status.");
      }
      if (review && data.agreementSigned !== true) throw new Error("Approval could not be confirmed. Look up the agreement again.");
      setReview(current => current ? { ...current, agreementSigned: true } : data as Review);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The agreement could not be processed.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return <details className="member-confirm">
    <summary>Review a desk pilot agreement</summary>
    <p>Set up or verify your authenticator before reviewing this agreement.</p>
    <MfaPanel mode="supabase" />
    <form key={review?.quoteId ?? "lookup"} className="ol-form" onSubmit={submit}>
      {!review ? <>
        <label>Agreement reference<input name="quoteId" required pattern={quoteReference} maxLength={36} disabled={busy || blocked} /></label>
        <div className="member-actions"><button className="button secondary" disabled={busy || blocked}>Look up agreement</button></div>
      </> : <>
        <p>Chair <strong>{review.chair}</strong> · {review.start}{review.end !== review.start ? " to " + review.end : ""} · <strong>{amount.format(review.amountPaise / 100)}</strong></p>
        <p>Customer signer <strong>{review.customerEmail}</strong><br />Armature countersigner <strong>{review.staffEmail}</strong></p>
        {review.policyVersion && <p>Policy version <strong>{review.policyVersion}</strong></p>}
        <p>Booking fingerprint <code style={{ overflowWrap: "anywhere" }}>{review.agreementHash}</code></p>
        {review.agreementSigned ? <p role="status">Agreement approved. Ask the customer to check their booking status.</p> : <>
          <p>Include this booking fingerprint in the agreement before sending it in PandaDoc. Open the completed agreement after both signers finish. Check the booking details and confirm both signatures on its certificate. Keep the completed PDF in the approved private agreement records.</p>
          <label>PandaDoc document ID<input name="documentId" required pattern="[A-Za-z0-9_\\-]{8,80}" maxLength={80} disabled={busy || blocked} /></label>
          <label>Booking fingerprint from the signed agreement<input name="agreementHash" required pattern="[0-9a-fA-F]{64}" maxLength={64} disabled={busy || blocked} /></label>
          <label>Completed PDF with signature certificate<input type="file" name="certificate" accept=".pdf,application/pdf" required disabled={busy || blocked} /></label>
          <p>The PDF stays on this device. Approval records its fingerprint.</p>
          <label><input type="checkbox" name="confirmed" required disabled={busy || blocked} /> I checked both signers, the approved agreement and the exact booking details.</label>
        </>}
        <div className="member-actions">
          {!review.agreementSigned && <button className="button" disabled={busy || blocked}>Approve agreement</button>}
          <button type="button" className="button secondary" disabled={busy || blocked} onClick={() => { setReview(null); setError(""); }}>Look up another agreement</button>
        </div>
      </>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  </details>;
}
