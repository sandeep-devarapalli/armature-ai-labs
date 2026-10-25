import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ONBOARDING_NOTICE_VERSION, getAgeOnDate, type LocalApplication } from "../lib/onboarding";
import "./ApplicationUpdates.css";

export interface OnboardingUpdate {
  id: string; user_id: string; status: string; revision: number; application_revision: number;
  full_name: string; linkedin_url: string; date_of_birth: string;
  previous_details: { full_name: string; linkedin_url: string; date_of_birth: string };
  application_status?: string;
  review_reason?: string | null; identity_changed?: boolean; needs_documents?: boolean;
}
const fields = [{ key: "full_name", label: "Full name" }, { key: "linkedin_url", label: "LinkedIn profile" }, { key: "date_of_birth", label: "Date of birth" }] as const;

export function ApplicationUpdates({ client, application, onSaved, onCancel, onBusyChange, onProposalChange, onDocuments, active = true, admin = false, canReject = false, refreshKey = "" }: {
  client: SupabaseClient; application: LocalApplication; onSaved: () => Promise<void> | void; onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void; onProposalChange?: (pending: boolean, identityChanged?: boolean) => void; onDocuments?: () => void;
  active?: boolean; admin?: boolean; canReject?: boolean; refreshKey?: string;
}) {
  const [update, setUpdate] = useState<OnboardingUpdate | null>(null);
  const [draft, setDraft] = useState({ full_name: "", linkedin_url: "", date_of_birth: "" });
  const [expected, setExpected] = useState({ application: application.revision, update: null as number | null });
  const [editing, setEditing] = useState(false), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [receipt, setReceipt] = useState("");
  const [compared, setCompared] = useState(false);
  const generation = useRef(0), actor = useRef<string | null>(null), mutating = useRef(false);
  useEffect(() => () => { generation.current++; onBusyChange?.(false); }, []);
  useEffect(() => { onProposalChange?.(update?.status === "pending", Boolean(update?.identity_changed)); }, [update, onProposalChange]);
  async function rpc(name: string, parameters: Record<string, unknown>, current: number) {
    const { data, error: sessionError } = await client.auth.getSession();
    const session = data.session;
    if (current !== generation.current) return null;
    if (sessionError || !session?.access_token || (!admin && session.user.id !== application.user_id) || (actor.current && actor.current !== session.user.id)) throw new Error("Your account changed. Reload before updating this application.");
    actor.current = session.user.id;
    const result = await client.rpc(name, parameters).setHeader("Authorization", `Bearer ${session.access_token}`);
    if (current !== generation.current) return null;
    const latest = await client.auth.getSession();
    if (current !== generation.current) return null;
    if (latest.error || latest.data.session?.user.id !== actor.current) throw new Error("Your account changed. Reload before updating this application.");
    if (result.error) throw new Error(result.error.code === "40001" ? "This application or proposal changed. Reload the latest details and compare them before saving again." : result.error.message || "The update could not be completed.");
    return result.data as OnboardingUpdate | null;
  }
  async function load() {
    if (mutating.current) return;
    const current = ++generation.current;
    setError("");
    try {
      const data = await rpc("get_onboarding_update", { p_user_id: application.user_id }, current);
      if (current !== generation.current) return;
      setUpdate(data?.id ? data : null); setLoaded(true);
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
  }
  useEffect(() => { if (active && !editing) void load(); }, [active, application.user_id, application.revision, refreshKey]);
  async function mutate(name: string, parameters: Record<string, unknown>, message: string) {
    if (mutating.current) return;
    mutating.current = true;
    const current = ++generation.current;
    setBusy(true); onBusyChange?.(true); setError(""); setReceipt("");
    try {
      const data = await rpc(name, parameters, current);
      if (current !== generation.current) return;
      if (!data?.id) throw new Error("The server did not confirm this update. Reload its status before trying again.");
      setUpdate(data); setEditing(false); setReceipt(message);
      try { await onSaved(); } catch { if (current === generation.current) setError("The change was recorded, but the application could not be refreshed. Reload to see the latest details."); }
    } catch (failure) { if (current === generation.current) setError((failure as Error).message); }
    finally { mutating.current = false; if (current === generation.current) { setBusy(false); onBusyChange?.(false); } }
  }
  function edit() {
    const values = update?.status === "pending" ? update : application;
    setDraft({ full_name: values.full_name, linkedin_url: values.linkedin_url, date_of_birth: values.date_of_birth });
    setExpected({ application: application.revision, update: update?.status === "pending" ? update.revision : null });
    setEditing(true); setCompared(false); setError(""); setReceipt("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (values.get("privacy_notice") !== "accepted") { setError("Accept the privacy notice and confirm the proposed changes."); return; }
    let age = 0;
    try { age = getAgeOnDate(draft.date_of_birth, today); } catch { /* Invalid or future dates need correction. */ }
    if (draft.full_name.trim().length < 2 || !/^https:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_%_-]+\/?$/.test(draft.linkedin_url.trim()) || age < 16) { setError("Enter a name, personal LinkedIn profile and date of birth. Minimum age is 16."); return; }
    await mutate("submit_onboarding_update", { p_full_name: draft.full_name.trim(), p_linkedin_url: draft.linkedin_url.trim(), p_date_of_birth: draft.date_of_birth, p_notice_version: ONBOARDING_NOTICE_VERSION, p_expected_application_revision: expected.application, p_expected_update_revision: expected.update }, "Changes submitted for staff review.");
  }
  const pending = update?.status === "pending";
  const submittedApplication = application.status !== "pending" || Boolean(application.submitted_at && application.submitted_revision === application.revision);
  return <section className="application-updates ol-history" aria-label="Application updates">
    <h3>Application updates</h3>
    {error && <p role="alert">{error}</p>}{receipt && <p role="status">{receipt}</p>}
    {error && <button type="button" className="button secondary" disabled={busy} onClick={() => { void (async () => { try { await onSaved(); await load(); if (editing) setCompared(true); } catch { setError("The latest application could not be loaded. Your edits are still here."); } })(); }}>Reload latest update</button>}
    {editing && compared && <p>Your unsaved changes are still below. Compare them with the current application and proposal before continuing. <button type="button" className="button secondary" disabled={busy} onClick={() => { setExpected({ application: application.revision, update: update?.status === "pending" ? update.revision : null }); setCompared(false); }}>Use latest revision for these changes</button></p>}
    {!loaded && !error && <p>Loading application updates…</p>}
    {update && <>
      <p>{pending ? "Changes awaiting staff review." : `Last update: ${update.status}.`} {application.status === "approved" && "Your current approved details remain active until staff approves a change."}</p>
      {update.review_reason && <p>Reviewer note: {update.review_reason}</p>}
      {pending && <><div className="application-update-scroll"><table><caption>Current application and proposed changes</caption><thead><tr><th>Detail</th><th>Current</th><th>Proposed</th></tr></thead><tbody>{fields.map(({ key, label }) => <tr key={key}><th scope="row">{label}</th><td data-label="Current">{application[key]}</td><td data-label="Proposed">{update[key]}</td></tr>)}</tbody></table></div>
        {update.needs_documents && <p>Current verification evidence is required before staff can accept this identity change. {onDocuments && <button type="button" className="button secondary" disabled={busy} onClick={onDocuments}>Update private documents</button>}</p>}
      </>}
    </>}
    {!admin && loaded && !editing && submittedApplication && <>
      <p>Submit corrections to your name, LinkedIn profile or date of birth. Your saved details stay unchanged until staff applies the changes. To change your phone, use the Mobile number step and verify the replacement. Your sign-in email is managed separately.</p>
      <button type="button" className="button" disabled={busy} onClick={edit}>{pending ? "Edit proposed changes" : "Edit application details"}</button>
      {pending && <button type="button" className="button secondary" disabled={busy} onClick={() => void mutate("withdraw_onboarding_update", { p_id: update.id, p_expected_revision: update.revision }, "Proposed changes withdrawn. Your current application is unchanged.")}>Withdraw proposed changes</button>}
    </>}
    {!admin && loaded && !submittedApplication && <p>Complete the final application submission below before proposing further changes.</p>}
    {!admin && editing && <form key={`${expected.application}:${expected.update}`} className="ol-form" onSubmit={submit}>
      <h4>Proposed changes</h4>
      <p>These changes require independent staff review. Your membership and current approved details do not change when you submit them.</p>
      <label>Full name<input required minLength={2} maxLength={120} value={draft.full_name} disabled={busy} onChange={event => setDraft({ ...draft, full_name: event.target.value })} /></label>
      <label>Your LinkedIn profile<input type="url" required value={draft.linkedin_url} disabled={busy} onChange={event => setDraft({ ...draft, linkedin_url: event.target.value })} /></label>
      <label>Date of birth<input type="date" required value={draft.date_of_birth} disabled={busy} onChange={event => setDraft({ ...draft, date_of_birth: event.target.value })} /></label>
      <label className="ol-consent"><input type="checkbox" name="privacy_notice" value="accepted" required disabled={busy} /> I confirm these proposed changes and accept the <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a>.</label>
      <button className="button" disabled={busy}>Submit changes for review</button><button type="button" className="button secondary" disabled={busy} onClick={() => { setEditing(false); setError(""); onCancel?.(); }}>Cancel changes</button>
    </form>}
    {admin && pending && <form className="ol-form" onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      if (!["approved", "rejected"].includes(decision || "")) return;
      if (String(values.get("reason") || "").trim().length < 10) { setError("Record a review reason of at least 10 characters."); return; }
      void mutate("review_onboarding_update", { p_id: update.id, p_expected_revision: update.revision, p_decision: decision, p_reason: values.get("reason"), p_guardian_email: values.get("guardian_email") || null, p_guardian_evidence: values.get("guardian_evidence") || null, p_guardian_received_at: values.get("guardian_received_at") ? new Date(String(values.get("guardian_received_at"))).toISOString() : null }, decision === "approved" ? "Changes applied. The application’s identity decision is unchanged; a pending application needs the member’s final resubmission. Rejected or revoked decisions remain in force." : "Proposed changes rejected. The current application is unchanged.");
    }}><h4>Review proposed changes</h4><p>Applying changes does not approve an identity application, restore revoked access or verify a phone number. Review supporting identity evidence privately before accepting a name or date-of-birth change.</p>
      <label>Review reason<textarea name="reason" required minLength={10} maxLength={1000} disabled={busy} /></label>
      {getAgeOnDate(update.date_of_birth, new Date().toISOString().slice(0, 10)) < 18 && <><label>Guardian email<input name="guardian_email" type="email" disabled={busy} /></label><label>Guardian email reference<input name="guardian_evidence" minLength={10} maxLength={300} disabled={busy} /></label><label>Guardian email received at<input name="guardian_received_at" type="datetime-local" disabled={busy} /></label></>}
      <button className="button" name="decision" value="approved" disabled={busy || update.needs_documents}>Apply proposed changes</button>{canReject && <button className="button secondary" name="decision" value="rejected" disabled={busy}>Reject proposed changes</button>}
    </form>}
    {admin && loaded && !pending && <p>No proposed changes awaiting review.</p>}
  </section>;
}
