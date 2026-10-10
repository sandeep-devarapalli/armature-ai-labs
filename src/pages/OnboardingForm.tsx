import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { documentAvailable, ONBOARDING_NOTICE_VERSION, type LocalApplication, type LocalDocument, type LocalReview } from "../lib/onboarding";
import { getAgeOnDate } from "../lib/onboarding";
import "./OnboardingLocalPage.css";
import { trackRegistrationMilestone } from "../lib/analytics";
import { useAccount, accountMembershipLevelsEnabled, accountMembershipLabel, applicationStatusLabel } from "../context/AccountContext";
import { PhoneVerification } from "../components/PhoneVerification";
import { AvatarSettings } from "../components/AvatarSettings";

export function OnboardingForm({ client, requestDocument, localLogin, initialUserId }: { initialUserId?: string; client: SupabaseClient | null; requestDocument: (id: string, file?: File) => Promise<Response>; localLogin?: (event: FormEvent<HTMLFormElement>) => Promise<Session> }) {
  const local = Boolean(localLogin);
  const { account } = useAccount();
  const levelsEnabled = accountMembershipLevelsEnabled(account);
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState(false);
  const [role, setRole] = useState("member");
  const [ownerAvailable, setOwnerAvailable] = useState(false);
  const [applications, setApplications] = useState<LocalApplication[]>([]);
  const [selected, setSelected] = useState("");
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [reviews, setReviews] = useState<(LocalReview & { reviewer_id?: string; reviewer_role?: string })[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, boolean>>({});
  const [received, setReceived] = useState(false);
  const confirmation = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const imageRef = useRef("");
  const generation = useRef(0);
  const identity = useRef<string | null>(null);
  const application = applications.find((item) => item.user_id === selected);
  const own = selected === session?.user.id;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const minor = application ? getAgeOnDate(application.date_of_birth, today) < 18 : false;
  const clearImage = () => { if (imageRef.current) URL.revokeObjectURL(imageRef.current); imageRef.current = ""; setImageUrl(""); };
  const clearSensitive = () => { generation.current++; setReceived(false); setFiles({}); setUploadErrors({}); setUploading(null); clearImage(); setError(""); setNotice(""); setApplications([]); setDocuments([]); setReviews([]); setStaff(false); setRole("member"); setOwnerAvailable(false); setSelected(""); };
  const adoptSession = (auth: Session | null) => {
    if (identity.current !== (auth?.user.id ?? null)) { clearSensitive(); identity.current = auth?.user.id ?? null; }
    setSession(auth);
  };
  useEffect(() => () => { generation.current++; if (imageRef.current) URL.revokeObjectURL(imageRef.current); }, []);

  async function refresh(userId = selected, auth = session) {
    if (!client || !auth) return;
    const requestGeneration = ++generation.current;
    const roles = await client.from("staff_roles").select("role").eq("user_id", auth.user.id);
    if (roles.error) throw roles.error;
    const applicationQuery = client.from("basic_onboarding_applications").select("*");
    const apps = await (initialUserId ? applicationQuery.eq("user_id", initialUserId) : applicationQuery).order("created_at", { ascending: false });
    if (apps.error) throw apps.error;
    const target = userId || auth.user.id;
    const [docs, history] = await Promise.all([
      client.from("onboarding_documents").select("*").eq("user_id", target).order("created_at", { ascending: false }),
      client.from("onboarding_reviews").select(local ? "id,decision,reason,created_at" : "id,decision,reason,created_at,reviewer_id,reviewer_role").eq("user_id", target).order("created_at", { ascending: false }),
    ]);
    if (docs.error) throw docs.error;
    if (history.error) throw history.error;
    if (requestGeneration !== generation.current || identity.current !== auth.user.id) return;
    const nextRole = ["super_admin", "admin", "membership_reviewer"].find((value) => roles.data.some((row) => row.role === value)) || "member";
    setRole(nextRole); setStaff(nextRole !== "member");
    if (!local && nextRole === "super_admin" && target === auth.user.id) {
      const summary = await client.rpc("get_basic_account_summary");
      if (requestGeneration !== generation.current || identity.current !== auth.user.id) return;
      setOwnerAvailable(!summary.error && Boolean(summary.data?.owner_approval_available));
    } else setOwnerAvailable(false);
    setApplications(apps.data); setSelected(target); setDocuments(docs.data); setReviews(history.data as unknown as (LocalReview & { reviewer_id?: string; reviewer_role?: string })[]);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : (failure as { message?: string }).message || "Request failed. Please try again."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!client) return;
    let active = true;
    const restore = (auth: Session | null) => {
      if (!active) return;
      adoptSession(auth);
      if (auth) void run(() => refresh(initialUserId || auth.user.id, auth));
      else clearSensitive();
    };
    const initialGeneration = generation.current;
    void client.auth.getSession().then(({ data, error }) => { if (!active || generation.current !== initialGeneration) return; if (error) setError(error.message); else restore(data.session); });
    const { data } = client.auth.onAuthStateChange((_event, auth) => {
      if (!active) return;
      adoptSession(auth);
      const authGeneration = generation.current;
      window.setTimeout(() => { if (generation.current === authGeneration) restore(auth); }, 0);
    });
    return () => { active = false; generation.current++; data.subscription.unsubscribe(); };
  }, [client, initialUserId]);
  useEffect(() => {
    if (!session) return;
    const reload = () => { clearImage(); void run(() => refresh()); };
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [session, selected]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => { const auth = await localLogin!(event); adoptSession(auth); await refresh(initialUserId || auth.user.id, auth); });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => {
      if (fields.get("privacy_notice") !== "accepted") throw new Error("Accept the privacy notice before submitting.");
      const result = await client!.rpc(application ? "resubmit_basic_onboarding" : "submit_basic_onboarding", {
        p_full_name: fields.get("full_name"), p_phone: fields.get("phone"), p_linkedin_url: fields.get("linkedin_url"), p_date_of_birth: fields.get("date_of_birth"), p_notice_version: ONBOARDING_NOTICE_VERSION,
      });
      if (result.error) throw result.error;
      if (!local) trackRegistrationMilestone("details_saved");
      await refresh(); setNotice(local ? "Details saved. Submit both synthetic images, then submit your application." : "Details saved. Submit your photo and ID, then submit your application."); document.getElementById("private-documents")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }
  useEffect(() => { const kind = Object.keys(uploadErrors).find(key => uploadErrors[key]); if (kind) document.getElementById(`upload-error-${kind}`)?.focus(); }, [uploadErrors]);
  useEffect(() => { if (received) confirmation.current?.showModal?.(); else confirmation.current?.close?.(); }, [received]);
  async function finalize() {
    const userId = session?.user.id;
    await run(async () => {
      const result = await client!.rpc("submit_basic_application_for_review", { p_expected_revision: application?.revision });
      if (result.error) throw result.error;
      if (identity.current !== userId) return;
      await refresh();
      if (identity.current !== userId) return;
      if (!local) trackRegistrationMilestone("application_submitted");
      setReceived(true); window.dispatchEvent(new Event("armature:account-changed"));
    });
  }
  async function upload(kind: "photo" | "government_id", event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); const file = fields.get("file") as File;
    const uploadUserId = session?.user.id;
    setUploadErrors(current => ({ ...current, [kind]: "" }));
    await run(async () => {
      try {
      if (!file?.size || file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG image up to 5 MiB.");
      let document = documents.find((item) => item.kind === kind && documentAvailable(item));
      if (!document) {
        const reserved = await client!.rpc("reserve_onboarding_document", { p_kind: kind, p_id_type: kind === "government_id" ? fields.get("id_type") : null });
        if (reserved.error) throw reserved.error;
        if (identity.current !== uploadUserId) return;
        document = reserved.data as LocalDocument;
        setDocuments(current => [document!, ...current.filter(item => item.id !== document!.id)]);
      }
      const userId = session?.user.id;
      setUploading(kind);
      try {
        const response = await requestDocument(document.id, file);
        if (!response.ok) throw new Error("Upload could not be confirmed. Please try again.");
        if (identity.current !== userId) return;
        await refresh();
        if (!local && identity.current === userId) trackRegistrationMilestone(kind === "photo" ? "photo_uploaded" : "government_id_uploaded");
        setNotice("Upload checked. Confirm its uploaded status below before submitting your application.");
      } finally { if (identity.current === userId) setUploading(null); }
      } catch (failure) {
        if (identity.current !== uploadUserId) return;
        setUploadErrors(current => ({ ...current, [kind]: failure instanceof Error ? failure.message : (failure as { message?: string }).message || "Upload failed. Please try again." }));
        throw failure;
      }
    });
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    await run(async () => {
      const result = decision === "corrections" ? await client!.rpc("request_onboarding_corrections", { p_user_id: selected, p_reason: fields.get("reason"), p_expected_revision: application?.revision }) : await client!.rpc("review_basic_onboarding", {
        p_user_id: selected, p_decision: decision, ...(!local ? { p_reason: fields.get("reason") || null } : {}), p_expected_revision: application?.revision,
        p_guardian_email: fields.get("guardian_email") || null, p_guardian_evidence: fields.get("guardian_evidence") || null,
        p_guardian_received_at: fields.get("guardian_received_at") ? new Date(String(fields.get("guardian_received_at"))).toISOString() : null,
      });
      if (result.error) throw result.error;
      clearImage(); await refresh(); window.dispatchEvent(new Event("armature:account-changed")); setNotice("Review recorded. No paid access has been granted.");
    });
  }
  const submitted = Boolean(application?.submitted_at && application.submitted_revision === application.revision);
  const completeDocuments = ["photo", "government_id"].every((kind) => documents.some((item) => item.kind === kind && item.uploaded_at && documentAvailable(item)));
  return <div className="onboarding-local"><header className="page-hero"><div className="wrap"><p className="eyebrow">{local ? "Local verification study" : "Free membership registration"}</p><h1>{initialUserId || (staff && selected && !own) ? "Membership review" : levelsEnabled ? "Your membership" : application?.status === "approved" ? "Your basic membership" : "Start your process"}</h1><p className="lede">Free registration and identity review, separate from paid access.</p><p className="ol-notice">{local ? "Synthetic test accounts and images only. This page connects exclusively to the isolated database on this computer. Do not upload a real ID. Production and payments remain disabled." : levelsEnabled ? "Confirmed email gives you Basic membership and free-course access. Approved identity and mobile verification unlock Verified membership. Paid workspace subscriptions qualify for Premium during their term; paid bookings remain closed." : "Basic registration is free. Staff approval verifies your registration; it does not include paid space or equipment access."}</p></div></header>
    <section className="section"><div className="wrap">
      {busy && <p role="status">Saving or loading…</p>}{error && <p className="ol-feedback" role="alert">{error}</p>}{notice && <p className="ol-feedback" role="status">{notice}</p>}
      {!client ? <p role="alert">Registration is currently unavailable. Please contact the lab.</p> : !session ? local ? <form className="ol-form" onSubmit={login}><h2>Sign in to the local test</h2><label>Email<input name="email" type="email" required autoComplete="username" /></label><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><button className="button" disabled={busy}>Sign in</button><p>Use a seeded synthetic account. No real account registration or email delivery is enabled here.</p></form> : <p><Link className="button" to="/auth" state={{ from: "/onboarding" }}>Start your process</Link></p> : <>
        <div className="ol-toolbar"><p>Signed in as <strong>{session.user.email}</strong>{staff && (role === "membership_reviewer" ? " · Staff reviewer" : role === "super_admin" ? " · Super admin" : " · Admin reviewer")}</p><button className="button secondary" disabled={busy} onClick={() => void run(async () => { clearImage(); await refresh(); setNotice("Status refreshed."); })}>Refresh status</button><button className="button secondary" disabled={busy} onClick={() => void run(async () => { adoptSession(null); clearSensitive(); await client!.auth.signOut(); })}>Sign out</button></div>
        {staff && !initialUserId && <label className="ol-selector">Application to review<select value={selected} disabled={busy} onChange={(event) => { const id = event.target.value; generation.current++; clearImage(); setDocuments([]); setReviews([]); setSelected(id); void run(() => refresh(id)); }}><option value={session.user.id}>My registration</option>{applications.filter((item) => item.user_id !== session.user.id).map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name} — {item.status}</option>)}</select></label>}
        {own && levelsEnabled && account && <section className="ol-history" aria-label="Membership verification"><h2>{accountMembershipLabel(account)}</h2><ul className="ol-checklist"><li>Email: {account.verification?.email ? "Verified" : "Confirmation required"}</li><li>Identity: {account.verification?.identity ? "Approved" : "Review required"}</li><li>Mobile: {account.verification?.mobile ? "Verified" : "Verification required"}</li></ul><p><a href="https://courses.armatureailabs.com/">Browse free courses</a>. Equipment requires Verified membership, qualifying workspace access and a separate booking.</p>{client && <PhoneVerification key={session.user.id} client={client} />}</section>}
        {own && <nav className="ol-steps" aria-label="Registration steps"><a href="#registration-details">1 · Your details</a><a href="#private-documents">2 · Private documents</a><a href="#submit-application">3 · Submit application</a></nav>}
        <div className="ol-grid"><div id="registration-details">
          <h2>{own ? "Your registration" : "Applicant details"}</h2>
          {application && <p className="ol-status">Status: <strong>{application.status === "pending" ? submitted ? "Pending review" : "Registration incomplete" : levelsEnabled ? applicationStatusLabel(application.status, true) : application.status.replaceAll("_", " ")}</strong></p>}
          {own && (!application || application.status === "corrections_requested") ? <form key={application?.status || "new"} className="ol-form" onSubmit={submit}><label>Full name<input name="full_name" required minLength={2} maxLength={120} defaultValue={application?.full_name} /></label><label>Verified email<input value={session.user.email || ""} readOnly /></label><label>Phone number<input name="phone" type="tel" required defaultValue={application?.phone} /></label><label>Your LinkedIn profile<input name="linkedin_url" type="url" required placeholder="https://www.linkedin.com/in/your-profile" defaultValue={application?.linkedin_url} /></label><label>Date of birth<input name="date_of_birth" type="date" required defaultValue={application?.date_of_birth} /></label><p>Minimum age: 16. For applicants aged 16–17, a guardian must email hello@armatureailabs.com with the member’s name and registered email, the guardian’s name and relationship, and explicit permission. Staff must review this email before approval.</p><label className="ol-consent"><input name="privacy_notice" type="checkbox" value="accepted" required /> I accept the <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a> (26 September 2026 · release 1), including identity review and the 30-day upload retention period.</label><button className="button" disabled={busy}>{application ? "Save corrections and continue" : "Save details and continue"}</button></form> : application ? <dl className="ol-details"><dt>Name</dt><dd>{application.full_name}</dd><dt>Email</dt><dd>{application.email}</dd><dt>Phone</dt><dd>{application.phone}</dd><dt>LinkedIn</dt><dd>{application.linkedin_url}</dd><dt>Date of birth</dt><dd>{application.date_of_birth}</dd></dl> : <p>Select an application.</p>}

          {reviews.length > 0 && <div className="ol-history"><h3>Review history</h3><ul>{reviews.map((item) => <li key={item.id}><strong>{item.decision.replaceAll("_", " ")}</strong> · {new Date(item.created_at).toLocaleString()}{item.reason && <p>{item.reason}</p>}{["admin", "super_admin"].includes(role) && item.reviewer_id && <p>Reviewer: {item.reviewer_id} · {item.reviewer_role?.replaceAll("_", " ") || "Admin"}</p>}</li>)}</ul></div>}
        </div><div id="private-documents"><h2>Private documents</h2><p>Choose each file, then submit it for a private security scan. An optional member avatar does not replace the required verification photo.</p><p>PNG or JPEG, up to 5 MiB each. Copies expire 30 days after upload, including while review is pending. Verification history is retained.</p>
          {application && ["photo", "government_id"].map((value) => { const kind = value as "photo" | "government_id"; const document = documents.find((item) => item.kind === kind && documentAvailable(item)); return <div className="ol-document" key={kind}><h3>{kind === "photo" ? "Verification photo" : "Government ID"}</h3>{document?.uploaded_at ? <><p className="ol-uploaded" role="status">{kind === "photo" ? "Photo Uploaded" : "Government ID Uploaded"}</p><p>Private copy expires {new Date(document.expires_at).toLocaleString()}.</p><button className="button secondary" disabled={busy} onClick={() => void run(async () => { const documentGeneration = generation.current; const response = await requestDocument(document.id); const bytes = new Uint8Array(await response.arrayBuffer()); if (generation.current !== documentGeneration) return; clearImage(); imageRef.current = URL.createObjectURL(new Blob([bytes], { type: bytes[0] === 137 ? "image/png" : "image/jpeg" })); setImageUrl(imageRef.current); })}>View {kind === "photo" ? "photo" : "government ID"}</button></> : <p>No current upload.</p>}{uploadErrors[kind] && <p id={`upload-error-${kind}`} tabIndex={-1} className="ol-feedback" role="alert">{uploadErrors[kind]}</p>}{own && application.status === "pending" && !document?.uploaded_at && <form className="ol-form" onSubmit={(event) => void upload(kind, event)}>{kind === "government_id" && <label>ID type<select name="id_type" defaultValue={document?.id_type || "pan"} disabled={Boolean(document)}><option value="pan">PAN card</option><option value="aadhaar">Aadhaar card</option><option value="passport">Passport</option></select></label>}<label>{local ? "Synthetic " : ""}{kind === "photo" ? "photo" : "government ID"} image<input name="file" type="file" accept="image/png,image/jpeg" required disabled={busy} onChange={event => setFiles(current => ({ ...current, [kind]: Boolean(event.target.files?.length) }))} /></label><button className="button secondary" disabled={busy || !files[kind]}>Submit {kind === "photo" ? "photo" : "government ID"}</button>{uploading === kind && <p role="status">Uploading and scanning {kind === "photo" ? "photo" : "government ID"}… Please wait for confirmation.</p>}</form>}</div>; })}
          {!application && <p>Save your registration first to upload documents.</p>}
          {imageUrl && <div className="ol-image"><button className="button secondary" onClick={clearImage}>Close image</button><img src={imageUrl} alt={local ? "Private synthetic verification document" : "Private verification document"} /></div>}
          {staff && !own && application && (role === "membership_reviewer" ? application.status === "pending" : ["pending", "rejected"].includes(application.status)) && <form key={`${application.user_id}:${application.revision}:${application.status}`} className="ol-form ol-review" onSubmit={review}><h3>Independent staff review</h3><p>Review identity documents only in this protected portal. Do not download, screenshot or retain copies. After upload deletion, retain only the verification result.</p>{minor && <><p>Review the actual guardian permission email. Record its reference, not a copy of its contents. A member-entered email alone is not consent.</p><label>Guardian email<input name="guardian_email" type="email" /></label><label>Guardian email reference<input name="guardian_evidence" minLength={10} maxLength={300} /></label><label>Guardian email received at<input name="guardian_received_at" type="datetime-local" /></label></>}{role !== "membership_reviewer" && <label>Correction instructions / decision reason<textarea name="reason" minLength={10} maxLength={1000} rows={3} /></label>}<p>Correction requests require clear instructions. Identity approval requires both unexpired uploads{minor ? " and reviewed guardian evidence" : ""}.{levelsEnabled && " Mobile verification is a separate requirement for Verified membership and cannot be bypassed here."}</p><div className="ol-actions"><button className="button" name="decision" value="approved" disabled={busy || application.status !== "pending" || !completeDocuments || !submitted}>{levelsEnabled ? "Approve identity application" : "Approve registration"}</button>{role !== "membership_reviewer" && <><button className="button secondary" name="decision" value="corrections" disabled={busy}>Request corrections</button><button className="button secondary" name="decision" value="rejected" disabled={busy || application.status !== "pending"}>Reject registration</button></>}</div></form>}
          {own && ownerAvailable && application?.status === "pending" && <form className="ol-form ol-review" onSubmit={(event) => { event.preventDefault(); void run(async () => {
            const result = await client!.rpc("approve_owner_basic_membership", { p_expected_revision: application.revision, p_confirm: true });
            if (result.error) throw result.error;
            clearImage(); await refresh(); window.dispatchEvent(new Event("armature:account-changed")); setNotice(levelsEnabled ? "Owner identity approval recorded. Mobile verification is still required for Verified membership; paid access is unchanged." : "Owner approval recorded. Basic membership is approved; paid access is unchanged.");
          }); }}><h3>One-time owner approval</h3><p>{levelsEnabled ? "This audited exception approves only your initial identity application. It does not bypass mobile verification and cannot be reused." : "This audited exception approves only your initial basic membership. It cannot be reused."}</p><label className="ol-consent"><input type="checkbox" required /> I confirm the one-time owner exception and have reviewed my complete application.</label><button className="button" disabled={busy || !completeDocuments || !submitted}>Confirm owner approval</button></form>}
        </div></div>
        {own && application && ["pending", "corrections_requested"].includes(application.status) && <section id="submit-application" className="ol-submit"><h2>Submit application</h2><ul className="ol-checklist"><li>✓ Personal details saved</li>{["photo", "government_id"].map(kind => <li key={kind}>{documents.some(item => item.kind === kind && item.uploaded_at && documentAvailable(item)) ? "✓" : "○"} {kind === "photo" ? "Verification photo uploaded" : "Government ID uploaded"}</li>)}<li>{submitted ? "✓ Application submitted for review" : "○ Final submission"}</li></ul>{application.status === "pending" && <><p>{submitted ? "Your details have been received. Staff will review your application. This does not grant paid access." : "After both uploads are confirmed, submit your application for staff review. Uploading files alone does not submit your application."}</p><button className="button" disabled={busy || !completeDocuments || submitted} onClick={() => void finalize()}>{submitted ? "Application submitted" : "Submit application"}</button></>}{minor && <p>Your guardian must email permission to hello@armatureailabs.com. Staff must review it before approval.</p>}</section>}
        {own && application && !local && <div className="ol-optional-avatar"><AvatarSettings client={client} userId={session.user.id} name={application.full_name} /></div>}
        </>}
    </div></section><dialog ref={confirmation} className="ol-confirmation" aria-labelledby="received-title" onClose={() => setReceived(false)}><h2 id="received-title">Your details have been received</h2><p>Your application has been submitted for staff review. You can return here to check its status. {levelsEnabled ? "Identity approval and mobile verification are both required for Verified membership. Paid access is separate." : "Basic approval does not include paid access."}</p><button className="button" autoFocus onClick={() => setReceived(false)}>Done</button></dialog></div>;
}
