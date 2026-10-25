import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PhoneNumberField } from "./PhoneNumberField";
import { canonicalPhone, formatPhone, phoneDraft } from "../lib/phoneNumber";

interface PhoneStatus {
  available_channels?: ("whatsapp" | "sms")[];
  enabled: boolean; verified: boolean; masked_phone: string | null;
  channel: "whatsapp" | "sms" | null; expires_at: string | null; resend_available_at: string | null;
}
interface PhoneVerificationProps {
  client: SupabaseClient;
  initialPhone?: string;
  userId?: string;
  showHeading?: boolean;
  onVerified?: () => Promise<void> | void;
}
export function PhoneVerification(props: PhoneVerificationProps) {
  return <AccountPhoneVerification key={props.userId || "current-account"} {...props} />;
}
function AccountPhoneVerification({ client, initialPhone = "", userId, showHeading = true, onVerified }: PhoneVerificationProps) {
  const initialCanonical = canonicalPhone(phoneDraft(initialPhone));
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [phone, setPhone] = useState<string | null>(initialCanonical);
  const [editorValue, setEditorValue] = useState(initialPhone);
  const [editorKey, setEditorKey] = useState(0);
  const [editing, setEditing] = useState(!initialCanonical);
  const [requestedPhone, setRequestedPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0), pristine = useRef(true);
  useEffect(() => {
    if (!pristine.current) return;
    setPhone(initialCanonical); setEditorValue(initialPhone); setEditing(!initialCanonical);
  }, [initialPhone, initialCanonical]);
  async function request(action: "status" | "start" | "verify", channel?: "whatsapp" | "sms") {
    const target = editing ? phone : requestedPhone || (!status?.expires_at ? phone : null);
    if (action === "start" && !target) return;
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      let headers: Record<string, string> | undefined;
      if (userId) {
        const session = await client.auth.getSession();
        if (current !== generation.current) return;
        if (session.error || session.data.session?.user.id !== userId || !session.data.session.access_token) {
          setStatus(null); setPhone(null); setRequestedPhone(null); setCode("");
          throw new Error("Your account changed. Refresh this page before verifying your number.");
        }
        headers = { Authorization: `Bearer ${session.data.session.access_token}` };
      }
      const result = await client.functions.invoke("member-phone-verification", {
        body: { action, ...(action === "start" ? { phone: target, channel } : {}), ...(action === "verify" ? { code } : {}) },
        ...(headers ? { headers } : {}),
      });
      if (current !== generation.current) return;
      if (userId) {
        const session = await client.auth.getSession();
        if (current !== generation.current) return;
        if (session.error || session.data.session?.user.id !== userId) {
          setStatus(null); setPhone(null); setRequestedPhone(null); setCode("");
          throw new Error("Your account changed. Refresh this page before verifying your number.");
        }
      }
      if (result.error || result.data?.error) {
        let failureCode = result.data?.code;
        if (result.error?.context instanceof Response) {
          try { failureCode = (await result.error.context.json()).code; } catch { /* Response is not a JSON error. */ }
        }
        if (current !== generation.current) return;
        const errors: Record<string, string> = { invalid_request: "Check the mobile number and country code, or enter a six-digit verification code.", invalid_code: "That code is invalid or expired. Check it or request a new code.", rate_limited: "Please wait before requesting another code.", verification_changed: "Your verification changed. Refresh and try again.", unavailable: "Mobile verification is temporarily unavailable. Your account access is unchanged.", channel_unavailable: "That delivery channel is unavailable. Refresh mobile verification to see available options." };
        throw new Error(errors[failureCode] || "Verification could not be completed. Please try again.");
      }
      const next = result.data as PhoneStatus;
      setStatus(next); setNow(Date.now());
      if (action === "start") {
        pristine.current = false; setRequestedPhone(target); setEditing(false); setCode("");
      }
      if (action === "status") {
        setRequestedPhone(null); setCode("");
        if (next.expires_at && pristine.current) setEditing(false);
      }
      if (action === "verify" && next.verified) {
        pristine.current = false;
        setChanging(false); setCode(""); setPhone(null); setRequestedPhone(null); setEditing(false);
        window.dispatchEvent(new Event("armature:account-changed"));
        try { await onVerified?.(); } catch { /* Verification remains confirmed if the parent refresh fails. */ }
      }
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
    finally { if (current === generation.current) setBusy(false); }
  }
  useEffect(() => { void request("status"); return () => { generation.current++; }; }, [client]);
  useEffect(() => {
    const boundaries = [status?.resend_available_at, status?.expires_at].map(value => value ? Date.parse(value) : NaN).filter(value => Number.isFinite(value) && value > now);
    if (!boundaries.length) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(...boundaries) - now + 50);
    return () => window.clearTimeout(timer);
  }, [status, now]);
  function editNumber(replacement = false) {
    pristine.current = false;
    const value = replacement || status?.expires_at ? "" : phone || initialPhone;
    setEditorValue(value); setPhone(canonicalPhone(phoneDraft(value))); setEditorKey(key => key + 1);
    setEditing(true); setChanging(replacement || changing); setError("");
  }
  const cooldown = Boolean(status?.resend_available_at && Date.parse(status.resend_available_at) > now);
  const pending = Boolean(status?.expires_at && Date.parse(status.expires_at) > now);
  const channels = status?.enabled ? (status.available_channels ?? ["sms"]) : [];
  const available = channels.includes("sms") || channels.includes("whatsapp");
  const target = editing ? phone : requestedPhone || (!status?.expires_at ? phone : null);
  const start = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (channels.includes("sms")) void request("start", "sms"); };
  return <section id="mobile-verification" className="ol-history" aria-labelledby={showHeading ? "mobile-verification-heading" : undefined} aria-label={showHeading ? undefined : "Mobile verification"}>
    {showHeading && <h2 id="mobile-verification-heading">Mobile verification</h2>}
    <p>Verify your personal number to complete Verified membership. It is not shown to other members.</p>
    {error && <><p role="alert">{error}</p>{status && <button className="button secondary" disabled={busy} onClick={() => void request("status")}>Refresh mobile verification</button>}</>}
    {busy && <p role="status">Checking verification…</p>}
    {!status && !busy && <button className="button secondary" onClick={() => void request("status")}>Retry mobile verification</button>}
    {status && !available && <p>Mobile verification is not available yet. You can continue using your account and free courses.</p>}
    {status?.enabled && <>
      {status.verified && <><p className="ol-uploaded" role="status">Mobile verified · {status.masked_phone}</p>{available && !changing && <button className="button secondary" disabled={busy} onClick={() => editNumber(true)}>Change mobile number</button>}</>}
      {available && (!status.verified || changing) && <>
        <form className="ol-form" onSubmit={start}>
          {editing ? <PhoneNumberField key={editorKey} defaultValue={editorValue} disabled={busy} onPhoneChange={value => { pristine.current = false; setPhone(value); }} /> : !status.expires_at && phone ? <>
            <p>Mobile number from your details<br /><strong>{formatPhone(phone)}</strong></p>
            <button type="button" className="button secondary" disabled={busy} onClick={() => editNumber()}>Edit number</button>
          </> : <>
            {!requestedPhone && <p>To send another code, confirm the mobile number first.</p>}
            <button type="button" className="button secondary" disabled={busy} onClick={() => editNumber()}>Edit number</button>
          </>}
          <p>One verified number per personal membership. A replacement must be verified before it can be used.</p>
          {channels.includes("sms") && <p>We will send a verification code by SMS.</p>}
          {channels.includes("sms") && <button className="button" disabled={busy || cooldown || !target}>Send SMS code</button>}
          {channels.includes("whatsapp") && <button type="button" className="button secondary" disabled={busy || cooldown || !target} onClick={() => void request("start", "whatsapp")}>Use WhatsApp instead</button>}
          {changing && status.verified && !requestedPhone && <button type="button" className="button secondary" disabled={busy} onClick={() => { setChanging(false); setEditing(false); setPhone(null); setError(""); }}>Cancel</button>}
          {cooldown && <p>Another code can be requested after {new Date(status.resend_available_at!).toLocaleTimeString()}.</p>}
        </form>
        {status.expires_at && <form className="ol-form" onSubmit={event => { event.preventDefault(); void request("verify"); }}>
          <p role="status">Code sent by {status.channel === "sms" ? "SMS" : "WhatsApp"} to {status.masked_phone}. {pending ? `Expires at ${new Date(status.expires_at).toLocaleTimeString()}.` : "This code has expired. Request a new code."}</p>
          <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} disabled={busy || !pending} /></label>
          <button className="button" disabled={busy || !pending || code.length !== 6}>Verify mobile number</button>
        </form>}
      </>}
    </>}
  </section>;
}
