import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";

export function SharedMobileApproval({ client, actorId, memberId, email, blocked, onBusyChange, onApproved }: {
  client: SupabaseClient;
  actorId: string;
  memberId: string;
  email: string;
  blocked: boolean;
  onBusyChange: (busy: boolean) => void;
  onApproved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const working = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (working.current) onBusyChange(false);
    };
  }, [onBusyChange]);

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || working.current || actorId === memberId) return;
    const fields = new FormData(event.currentTarget);
    const sourceEmail = String(fields.get("source_email") ?? "").trim().toLowerCase();
    const reason = String(fields.get("reason") ?? "").trim();
    if (fields.get("same_person") !== "on" || !sourceEmail || sourceEmail === email.toLowerCase()
      || reason.length < 10 || reason.length > 1000) {
      setError("Enter a different source account, a reason of 10 to 1000 characters and confirm both accounts belong to the same person.");
      return;
    }
    working.current = true;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const [session, assurance] = await Promise.all([
        client.auth.getSession(), client.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (!active.current) return;
      const current = session.data.session;
      if (session.error || current?.user.id !== actorId || !current.access_token
        || assurance.error || assurance.data.currentLevel !== "aal2") {
        setError("Verify the current Admin session with your authenticator, then reopen the member details.");
        return;
      }
      const result = await client.rpc("approve_shared_member_phone", {
        p_target_user_id: memberId, p_source_email: sourceEmail, p_reason: reason, p_confirmed_same_person: true,
      }).setHeader("Authorization", `Bearer ${current.access_token}`);
      if (!active.current) return;
      if (result.error || result.data?.approved !== true || result.data.method !== "staff_shared") {
        setError(result.error?.code === "42501" ? "Approval requires current Admin access and MFA. Refresh the member details."
          : result.error?.code === "22023" ? "The approval was declined. Check the source verification and target account before trying again."
          : "Approval could not be confirmed. Refresh the member details before trying again.");
        return;
      }
      setOpen(false);
      onApproved();
    } catch {
      if (active.current) setError("Approval could not be confirmed. Refresh the member details before trying again.");
    } finally {
      working.current = false;
      if (active.current) { setBusy(false); onBusyChange(false); }
    }
  }

  return <div className="member-confirm">
    {!open ? <button type="button" className="button secondary" disabled={blocked} onClick={() => setOpen(true)}>Approve shared mobile</button> : <>
      <h3>Approve shared mobile</h3>
      <p>Target account: <strong>{email}</strong></p>
      <p>Verify this Admin session first. Reopen the member details if completing MFA closes them.</p>
      <MfaPanel mode="supabase" />
      <form className="ol-form" onSubmit={approve}>
        <label>Source account email<input type="email" name="source_email" required maxLength={320} autoComplete="off" disabled={busy || blocked} /></label>
        <label>Approval reason<textarea name="reason" required minLength={10} maxLength={1000} rows={3} disabled={busy || blocked} /></label>
        <p>Both accounts need approved identities. Check that the target's saved mobile matches the number already verified by a code on the source account. Keep phone numbers, codes and identity documents out of the reason.</p>
        <label><input type="checkbox" name="same_person" required disabled={busy || blocked} /> I confirmed both accounts belong to the same person and they authorised this use.</label>
        <div className="member-actions">
          <button className="button" disabled={busy || blocked}>Confirm shared mobile approval</button>
          <button type="button" className="button secondary" disabled={busy || blocked} onClick={() => { setOpen(false); setError(""); }}>Cancel shared mobile approval</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </>}
  </div>;
}
