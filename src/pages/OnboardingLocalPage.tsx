import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { documentAvailable, onboardingLocal as client, requestLocalDocument, type LocalApplication, type LocalDocument, type LocalReview } from "../lib/onboardingLocal";
import { getAgeOnDate } from "../lib/membershipPreview";
import "./OnboardingLocalPage.css";

export function OnboardingLocalPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState(false);
  const [applications, setApplications] = useState<LocalApplication[]>([]);
  const [selected, setSelected] = useState("");
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [reviews, setReviews] = useState<LocalReview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const imageRef = useRef("");
  const application = applications.find((item) => item.user_id === selected);
  const own = selected === session?.user.id;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const minor = application ? getAgeOnDate(application.date_of_birth, today) < 18 : false;
  const clearImage = () => { if (imageRef.current) URL.revokeObjectURL(imageRef.current); imageRef.current = ""; setImageUrl(""); };
  useEffect(() => () => { if (imageRef.current) URL.revokeObjectURL(imageRef.current); }, []);

  async function refresh(userId = selected, auth = session) {
    if (!client || !auth) return;
    const roles = await client.from("staff_roles").select("role").eq("user_id", auth.user.id);
    if (roles.error) throw roles.error;
    const apps = await client.from("basic_onboarding_applications").select("*").order("created_at", { ascending: false });
    if (apps.error) throw apps.error;
    const target = userId || auth.user.id;
    const [docs, history] = await Promise.all([
      client.from("onboarding_documents").select("*").eq("user_id", target).order("created_at", { ascending: false }),
      client.from("onboarding_reviews").select("id,decision,reason,created_at").eq("user_id", target).order("created_at", { ascending: false }),
    ]);
    if (docs.error) throw docs.error;
    if (history.error) throw history.error;
    setStaff(roles.data.some((row) => ["admin", "super_admin"].includes(row.role)));
    setApplications(apps.data); setSelected(target); setDocuments(docs.data); setReviews(history.data);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : (failure as { message?: string }).message || "Request failed. Please try again."); }
    finally { setBusy(false); }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => {
      const result = await client!.auth.signInWithPassword({ email: String(fields.get("email")), password: String(fields.get("password")) });
      if (result.error) throw result.error;
      setSession(result.data.session); await refresh(result.data.user.id, result.data.session);
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await run(async () => {
      const result = await client!.rpc(application ? "resubmit_basic_onboarding" : "submit_basic_onboarding", {
        p_full_name: fields.get("full_name"), p_phone: fields.get("phone"), p_linkedin_url: fields.get("linkedin_url"), p_date_of_birth: fields.get("date_of_birth"),
      });
      if (result.error) throw result.error;
      await refresh(); setNotice("Registration saved. Upload both synthetic images before staff review.");
    });
  }
  async function upload(kind: "photo" | "government_id", event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget); const file = fields.get("file") as File;
    await run(async () => {
      if (!file?.size || file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG or JPEG image up to 5 MiB.");
      let document = documents.find((item) => item.kind === kind && documentAvailable(item));
      if (!document) {
        const reserved = await client!.rpc("reserve_onboarding_document", { p_kind: kind, p_id_type: kind === "government_id" ? fields.get("id_type") : null });
        if (reserved.error) throw reserved.error;
        document = reserved.data as LocalDocument;
      }
      await requestLocalDocument(document.id, file); await refresh(); setNotice("Synthetic image uploaded privately.");
    });
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    await run(async () => {
      const result = decision === "corrections" ? await client!.rpc("request_onboarding_corrections", { p_user_id: selected, p_reason: fields.get("reason"), p_expected_revision: application?.revision }) : await client!.rpc("review_basic_onboarding", {
        p_user_id: selected, p_decision: decision, p_expected_revision: application?.revision,
        p_guardian_email: fields.get("guardian_email") || null, p_guardian_evidence: fields.get("guardian_evidence") || null,
        p_guardian_received_at: fields.get("guardian_received_at") ? new Date(String(fields.get("guardian_received_at"))).toISOString() : null,
      });
      if (result.error) throw result.error;
      clearImage(); await refresh(); setNotice("Review recorded. No paid access has been granted.");
    });
  }
  const completeDocuments = ["photo", "government_id"].every((kind) => documents.some((item) => item.kind === kind && item.uploaded_at && documentAvailable(item)));
  return <div className="onboarding-local"><header className="page-hero"><div className="wrap"><p className="eyebrow">Local verification study</p><h1>Basic membership</h1><p className="lede">Free registration and identity review, separate from paid access.</p><p className="ol-notice">Synthetic test accounts and images only. This page connects exclusively to the isolated database on this computer. Do not upload a real ID. Production and payments remain disabled.</p></div></header>
    <section className="section"><div className="wrap">
      {busy && <p role="status">Saving or loading…</p>}{error && <p className="ol-feedback" role="alert">{error}</p>}{notice && <p className="ol-feedback" role="status">{notice}</p>}
      {!client ? <p role="alert">Local onboarding is unavailable. Start the isolated backend and configure its public anonymous key.</p> : !session ? <form className="ol-form" onSubmit={login}><h2>Sign in to the local test</h2><label>Email<input name="email" type="email" required autoComplete="username" /></label><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><button className="button" disabled={busy}>Sign in</button><p>Use a seeded synthetic account. No real account registration or email delivery is enabled here.</p></form> : <>
        <div className="ol-toolbar"><p>Signed in as <strong>{session.user.email}</strong>{staff && " · Admin reviewer"}</p><button className="button secondary" disabled={busy} onClick={() => void run(async () => { clearImage(); await refresh(); setNotice("Status refreshed."); })}>Refresh status</button><button className="button secondary" disabled={busy} onClick={() => void run(async () => { await client!.auth.signOut(); clearImage(); setSession(null); setApplications([]); setDocuments([]); setReviews([]); setStaff(false); setSelected(""); })}>Sign out</button></div>
        {staff && <label className="ol-selector">Application to review<select value={selected} disabled={busy} onChange={(event) => { const id = event.target.value; clearImage(); void run(() => refresh(id)); }}><option value={session.user.id}>My registration</option>{applications.filter((item) => item.user_id !== session.user.id).map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name} — {item.status}</option>)}</select></label>}
        <div className="ol-grid"><div>
          <h2>{own ? "Your registration" : "Applicant details"}</h2>
          {application && <p className="ol-status">Status: <strong>{application.status.replaceAll("_", " ")}</strong></p>}
          {own && (!application || application.status === "corrections_requested") ? <form key={application?.status || "new"} className="ol-form" onSubmit={submit}><label>Full name<input name="full_name" required minLength={2} maxLength={120} defaultValue={application?.full_name} /></label><label>Verified email<input value={session.user.email || ""} readOnly /></label><label>Phone number<input name="phone" type="tel" required defaultValue={application?.phone} /></label><label>Your LinkedIn profile<input name="linkedin_url" type="url" required placeholder="https://www.linkedin.com/in/your-profile" defaultValue={application?.linkedin_url} /></label><label>Date of birth<input name="date_of_birth" type="date" required defaultValue={application?.date_of_birth} /></label><p>Minimum age: 16. For applicants aged 16–17, staff must review a guardian’s permission email before approval.</p><button className="button" disabled={busy}>{application ? "Resubmit corrections" : "Submit registration"}</button></form> : application ? <dl className="ol-details"><dt>Name</dt><dd>{application.full_name}</dd><dt>Email</dt><dd>{application.email}</dd><dt>Phone</dt><dd>{application.phone}</dd><dt>LinkedIn</dt><dd>{application.linkedin_url}</dd><dt>Date of birth</dt><dd>{application.date_of_birth}</dd></dl> : <p>Select an application.</p>}
          {reviews.length > 0 && <div className="ol-history"><h3>Review history</h3><ul>{reviews.map((item) => <li key={item.id}><strong>{item.decision.replaceAll("_", " ")}</strong> · {new Date(item.created_at).toLocaleString()}{item.reason && <p>{item.reason}</p>}</li>)}</ul></div>}
        </div><div><h2>Private documents</h2><p>PNG or JPEG, up to 5 MiB each. Copies expire 30 days after upload, including while review is pending. Verification history is retained.</p>
          {application && ["photo", "government_id"].map((value) => { const kind = value as "photo" | "government_id"; const document = documents.find((item) => item.kind === kind && documentAvailable(item)); return <div className="ol-document" key={kind}><h3>{kind === "photo" ? "Profile photo" : "Government ID"}</h3>{document?.uploaded_at ? <><p>Uploaded · expires {new Date(document.expires_at).toLocaleString()}</p><button className="button secondary" disabled={busy} onClick={() => void run(async () => { const response = await requestLocalDocument(document.id); const bytes = new Uint8Array(await response.arrayBuffer()); clearImage(); imageRef.current = URL.createObjectURL(new Blob([bytes], { type: bytes[0] === 137 ? "image/png" : "image/jpeg" })); setImageUrl(imageRef.current); })}>View {kind === "photo" ? "photo" : "government ID"}</button></> : <p>No current upload.</p>}{own && application.status === "pending" && !document?.uploaded_at && <form className="ol-form" onSubmit={(event) => void upload(kind, event)}>{kind === "government_id" && <label>ID type<select name="id_type" defaultValue={document?.id_type || "pan"} disabled={Boolean(document)}><option value="pan">PAN card</option><option value="aadhaar">Aadhaar card</option><option value="passport">Passport</option></select></label>}<label>Synthetic {kind === "photo" ? "photo" : "government ID"} image<input name="file" type="file" accept="image/png,image/jpeg" required /></label><button className="button secondary" disabled={busy}>Upload {kind === "photo" ? "photo" : "government ID"}</button></form>}</div>; })}
          {!application && <p>Save your registration first to upload documents.</p>}
          {imageUrl && <div className="ol-image"><button className="button secondary" onClick={clearImage}>Close image</button><img src={imageUrl} alt="Private synthetic verification document" /></div>}
          {staff && !own && application && ["pending", "rejected"].includes(application.status) && <form key={`${application.user_id}:${application.revision}:${application.status}`} className="ol-form ol-review" onSubmit={review}><h3>Independent staff review</h3>{minor && <><p>Review the actual guardian permission email. Record its reference, not a copy of its contents. A member-entered email alone is not consent.</p><label>Guardian email<input name="guardian_email" type="email" /></label><label>Guardian email reference<input name="guardian_evidence" minLength={10} maxLength={300} /></label><label>Guardian email received at<input name="guardian_received_at" type="datetime-local" /></label></>}<label>Correction instructions<textarea name="reason" minLength={10} maxLength={1000} rows={3} /></label><p>Correction requests require clear instructions. Approval requires both unexpired uploads{minor ? " and reviewed guardian evidence" : ""}.</p><div className="ol-actions"><button className="button" name="decision" value="approved" disabled={busy || application.status !== "pending" || !completeDocuments}>Approve registration</button><button className="button secondary" name="decision" value="corrections" disabled={busy}>Request corrections</button><button className="button secondary" name="decision" value="rejected" disabled={busy || application.status !== "pending"}>Reject registration</button></div></form>}
        </div></div></>}
    </div></section></div>;
}
