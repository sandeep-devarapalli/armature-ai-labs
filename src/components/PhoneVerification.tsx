import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

interface PhoneStatus {
  available_channels?: ("whatsapp" | "sms")[];
  enabled: boolean; verified: boolean; masked_phone: string | null;
  channel: "whatsapp" | "sms" | null; expires_at: string | null; resend_available_at: string | null;
}
export function PhoneVerification({ client }: { client: SupabaseClient }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  async function request(action: "status" | "start" | "verify", channel?: "whatsapp" | "sms") {
    const current = ++generation.current;
    setBusy(true); setError("");
    try {
      const result = await client.functions.invoke("member-phone-verification", { body: { action, ...(action === "start" ? { phone: phone.trim(), channel } : {}), ...(action === "verify" ? { code } : {}) } });
      if (current !== generation.current) return;
      if (result.error || result.data?.error) {
        let failureCode = result.data?.code;
        if (result.error?.context instanceof Response) {
          try { failureCode = (await result.error.context.json()).code; } catch { /* Response is not a JSON error. */ }
        }
        if (current !== generation.current) return;
        const errors: Record<string, string> = { invalid_request: "Enter a valid mobile number with country code, such as +91, or a six-digit code.", invalid_code: "That code is invalid or expired. Check it or request a new code.", rate_limited: "Please wait before requesting another code.", verification_changed: "Your verification changed. Refresh and try again.", unavailable: "Mobile verification is temporarily unavailable. Your account access is unchanged." };
        throw new Error(errors[failureCode] || "Verification could not be completed. Please try again.");
      }
      const next = result.data as PhoneStatus;
      setStatus(next); setNow(Date.now());
      if (action === "start") setCode("");
      if (action === "verify" && next.verified) {
        setChanging(false); setCode(""); setPhone("");
        window.dispatchEvent(new Event("armature:account-changed"));
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
  const cooldown = Boolean(status?.resend_available_at && Date.parse(status.resend_available_at) > now);
  const pending = Boolean(status?.expires_at && Date.parse(status.expires_at) > now);
  const channels = status?.enabled ? (status.available_channels ?? ["sms"]) : [];
  const available = channels.includes("sms") || channels.includes("whatsapp");
  const start = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (channels.includes("sms")) void request("start", "sms"); };
  return <section id="mobile-verification" className="ol-history" aria-labelledby="mobile-verification-heading">
    <h2 id="mobile-verification-heading">Mobile verification</h2>
    <p>Verify your personal number to complete Verified membership. It is not shown to other members.</p>
    {error && <><p role="alert">{error}</p>{status && <button className="button secondary" disabled={busy} onClick={() => void request("status")}>Refresh mobile verification</button>}</>}
    {busy && <p role="status">Checking verification…</p>}
    {!status && !busy && <button className="button secondary" onClick={() => void request("status")}>Retry mobile verification</button>}
    {status && !available && <p>Mobile verification is not available yet. You can continue using your account and free courses.</p>}
    {status?.enabled && <>
      {status.verified && <><p className="ol-uploaded" role="status">Mobile verified · {status.masked_phone}</p>{available && !changing && <button className="button secondary" onClick={() => setChanging(true)}>Change mobile number</button>}</>}
      {available && (!status.verified || changing) && <>
        <form className="ol-form" onSubmit={start}>
          <label>Mobile number with country code<input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} required pattern="\+[1-9][0-9]{7,14}" placeholder="+91…" disabled={busy} /></label>
          <p>One verified number per personal membership. A replacement must be verified before it can be used.</p>
          {channels.includes("sms") && <p>We will send a verification code by SMS.</p>}
          {channels.includes("sms") && <button className="button" disabled={busy || cooldown}>Send SMS code</button>}
          {channels.includes("whatsapp") && <button type="button" className="button secondary" disabled={busy || cooldown || !/^\+[1-9]\d{7,14}$/.test(phone.trim())} onClick={() => void request("start", "whatsapp")}>Use WhatsApp instead</button>}
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
