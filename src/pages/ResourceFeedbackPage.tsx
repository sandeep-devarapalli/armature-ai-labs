import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { feedbackBase, feedbackConsent, feedbackDocument, feedbackDocuments, feedbackRpc, feedbackSource, type FeedbackAccess, type FeedbackDocument, type FeedbackList, type FeedbackStatus, type ResourceFeedback } from "../lib/resourceFeedback";
import "./ResourceFeedbackPage.css";

const emptyList: FeedbackList = { items: [], total: 0 };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Feedback is unavailable. Please try again.";
type ClientProps = { client?: SupabaseClient | null };

function Pagination({ page, total, change, label }: { page: number; total: number; change: (page: number) => void; label: string }) {
  if (total <= 20 && page === 1) return null;
  return <nav className="feedback-pagination" aria-label={label}><button disabled={page === 1} onClick={() => change(page - 1)}>Previous</button><span>Page {page} · {total} submissions</span><button disabled={page * 20 >= total} onClick={() => change(page + 1)}>Next</button></nav>;
}

function FeedbackCard({ item, own = false, children }: { item: ResourceFeedback; own?: boolean; children?: ReactNode }) {
  const source = feedbackSource(item.source_url);
  return <article className="feedback-card" id={`feedback-${item.id}`}>
    <header><strong>{item.display_name}</strong><span>{item.kind === "correction" ? "Suggested correction" : "Comment"} · {new Date(item.created_at).toLocaleDateString("en-IN")}{own && item.status ? ` · ${item.status === "approved" ? "Published" : item.status === "pending" ? "Awaiting review" : item.status}` : ""}</span></header>
    {item.reference && <p className="feedback-reference">Section / model: {item.reference}</p>}
    <p className="feedback-body">{item.body}</p>
    {source && <p><a href={source} target="_blank" rel="noopener noreferrer nofollow ugc">Supporting source ↗</a></p>}
    {item.response && <div className="feedback-response"><strong>Armature response</strong><p>{item.response}</p></div>}
    {own && item.review_note && <p className="feedback-review-note"><strong>Review note:</strong> {item.review_note}</p>}
    {children}
  </article>;
}

function SubmitFeedback({ document, client, saved, refreshing }: { document: FeedbackDocument; client: SupabaseClient | null; saved: () => void; refreshing: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || refreshing) return;
    const form = event.currentTarget, data = new FormData(form);
    if (data.get("consent") !== "yes") { setError("Confirm that your chosen name and feedback may be published after review."); return; }
    const args = { p_document: document, p_kind: String(data.get("kind")), p_reference: String(data.get("reference") || "").trim(), p_body: String(data.get("body") || "").trim(), p_source_url: String(data.get("source") || "").trim(), p_display_name: String(data.get("name") || "").trim(), p_consent_version: feedbackConsent };
    if (!args.p_body || !args.p_display_name) { setError("Add your public display name and feedback."); return; }
    if (args.p_source_url && !feedbackSource(args.p_source_url)) { setError("Use an http or https supporting source URL."); return; }
    const payload = JSON.stringify(args);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      await feedbackRpc("submit_resource_feedback", { ...args, p_request_id: request.current.id }, client);
      if (!active.current) return;
      form.reset(); request.current = null; saved();
    } catch (reason) { if (active.current) setError(errorText(reason)); }
    finally { if (active.current) setBusy(false); }
  }
  return <section aria-labelledby="feedback-submit-title"><h2 id="feedback-submit-title">Leave feedback</h2><p>Basic membership is enough. Choose the name to show publicly. Your feedback appears only after an Admin or Super admin approves it; your account email stays private.</p>
    <form className="feedback-form" onSubmit={submit}>
      <fieldset disabled={busy || refreshing}><div className="feedback-fields">
        <label>Public display name<input name="name" required maxLength={100} autoComplete="off" /></label>
        <label>Feedback type<select name="kind"><option value="comment">Comment</option><option value="correction">Suggest a correction</option></select></label>
      </div><label>Section, page or actuator model (optional)<input name="reference" maxLength={200} /></label>
      <label>Your comment or correction<textarea name="body" required maxLength={4000} rows={6} /></label>
      <label>Supporting source URL (optional)<input name="source" type="url" maxLength={2000} placeholder="https://" /></label>
      <label className="feedback-consent"><input name="consent" type="checkbox" value="yes" required /><span>I agree that my chosen display name and this feedback may be made public after admin approval. I have not included private contact details or confidential information.</span></label>
      <button className="button" type="submit">{busy ? "Submitting…" : "Submit for review"}</button></fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form></section>;
}

function FeedbackThread({ document, client, userId, signedIn }: { document: FeedbackDocument; client: SupabaseClient | null; userId?: string; signedIn: boolean }) {
  const location = useLocation();
  const [published, setPublished] = useState(emptyList), [own, setOwn] = useState(emptyList);
  const [access, setAccess] = useState<FeedbackAccess | null>(null);
  const [page, setPage] = useState(1), [ownPage, setOwnPage] = useState(1), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setBusy(false); setError(""); setPublished(emptyList); setOwn(emptyList);
    void Promise.all([
      feedbackRpc<FeedbackList>("list_resource_feedback", { p_document: document, p_page: page }, client),
      userId ? feedbackRpc<FeedbackList>("list_my_resource_feedback", { p_document: document, p_page: ownPage }, client) : Promise.resolve(emptyList),
      userId ? feedbackRpc<FeedbackAccess>("resource_feedback_access", {}, client) : Promise.resolve(null)
    ]).then(([publicRows, ownRows, rights]) => { if (current === generation.current) { setPublished(publicRows); setOwn(ownRows); setAccess(rights); } }).catch(reason => { if (current === generation.current) setError(errorText(reason)); }).finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [client, document, userId, page, ownPage, revision]);
  async function withdraw(item: ResourceFeedback) {
    const current = generation.current; setBusy(true); setError("");
    try { await feedbackRpc("withdraw_resource_feedback", { p_id: item.id, p_expected_revision: item.revision }, client); if (current === generation.current) { setNotice("Your feedback was withdrawn and is no longer public."); setRevision(value => value + 1); } }
    catch (reason) { if (current === generation.current) setError(errorText(reason)); }
    finally { if (current === generation.current) setBusy(false); }
  }
  return <>
    {access?.can_moderate && <p><Link to="/admin/resource-feedback">Review resource feedback</Link></p>}
    {notice && <p role="status" className="feedback-notice">{notice}</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
    <section><h2>Published comments &amp; corrections</h2>{loading ? <p role="status">Loading feedback…</p> : !error && !published.items.length ? <p>No published feedback yet.</p> : published.items.map(item => <FeedbackCard key={item.id} item={item} />)}<Pagination page={page} total={published.total} change={setPage} label="Published feedback pages" /></section>
    {!signedIn && <p><Link to="/auth" state={{ from: location.pathname + location.search }}>Sign in or register for free</Link> with Basic membership to leave feedback.</p>}
    {signedIn && !userId && <p role="status">Loading your membership status…</p>}
    {access && !access.can_submit && <p>Your account cannot currently submit feedback. <Link to="/onboarding">Check your membership status</Link>. Existing feedback can still be withdrawn below.</p>}
    {access?.can_submit && <SubmitFeedback document={document} client={client} refreshing={loading || Boolean(error)} saved={() => { setNotice("Feedback submitted for review. It is visible to you and admins until approved."); setOwnPage(1); setRevision(value => value + 1); }} />}
    {userId && <section><h2>Your submissions</h2>{!loading && !error && !own.items.length && <p>You have not submitted feedback on this document.</p>}{own.items.map(item => <FeedbackCard key={item.id} item={item} own>{item.status !== "withdrawn" && <button disabled={busy} onClick={() => void withdraw(item)}>Withdraw my feedback</button>}</FeedbackCard>)}<Pagination page={ownPage} total={own.total} change={setOwnPage} label="Your feedback pages" /></section>}
  </>;
}

export function ResourceFeedbackPage({ client = supabase }: ClientProps) {
  const [params] = useSearchParams();
  const document = feedbackDocument(params.get("document"));
  const { account, signedIn, error, refresh } = useAccount();
  return <article className="wrap resource-feedback"><p><Link to={feedbackBase}>Robotic actuators</Link> / Comments &amp; corrections</p><h1>Comments &amp; corrections</h1><p>Help improve the evidence and specifications. Suggestions are reviewed before publication and do not change the documents automatically.</p>
    <nav className="feedback-document-tabs" aria-label="Feedback document">{Object.entries(feedbackDocuments).map(([key, value]) => <Link key={key} aria-current={key === document ? "page" : undefined} to={`${feedbackBase}/feedback?document=${key}`}>{value.title}</Link>)}</nav>
    <p><a href={`${feedbackBase}/${feedbackDocuments[document].file}`}>Read {feedbackDocuments[document].title.toLowerCase()} ↗</a><span className="feedback-version">Document version: 25 October 2026</span></p>
    {error && <p role="alert">Membership status could not be loaded. <button onClick={() => void refresh()}>Retry account status</button></p>}
    <FeedbackThread key={`${document}:${account?.user_id || "anonymous"}:${account?.role}:${account?.status}:${account?.membership_level}`} document={document} client={client} userId={account?.user_id} signedIn={signedIn} />
  </article>;
}

function ReviewForm({ item, client, saved }: { item: ResourceFeedback; client: SupabaseClient | null; saved: () => void }) {
  const [response, setResponse] = useState(item.response || ""), [note, setNote] = useState(item.review_note || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function decide(status: FeedbackStatus) {
    if (busy) return;
    if (status !== "approved" && !note.trim()) { setError("Add a note explaining the decision to the author."); return; }
    setBusy(true); setError("");
    try { await feedbackRpc("review_resource_feedback", { p_id: item.id, p_expected_revision: item.revision, p_status: status, p_response: response.trim(), p_review_note: note.trim() }, client); if (active.current) saved(); }
    catch (reason) { if (active.current) setError(errorText(reason)); }
    finally { if (active.current) setBusy(false); }
  }
  return <div className="feedback-form"><label>Public Armature response (optional)<textarea value={response} maxLength={2000} rows={3} onChange={event => setResponse(event.target.value)} disabled={busy} /></label><label>Review note to the author (not public)<textarea value={note} maxLength={2000} rows={2} onChange={event => setNote(event.target.value)} disabled={busy} /></label><div className="feedback-actions"><button disabled={busy || item.status === "withdrawn"} onClick={() => void decide("approved")}>{item.status === "approved" ? "Save public response" : "Approve and publish"}</button><button disabled={busy || item.status === "withdrawn"} onClick={() => void decide("rejected")}>Reject</button><button disabled={busy || item.status === "withdrawn"} onClick={() => void decide("withdrawn")}>Withdraw from publication</button></div>{error && <p role="alert">{error}</p>}</div>;
}

function FeedbackReviewQueue({ client }: { client: SupabaseClient | null }) {
  const [access, setAccess] = useState<FeedbackAccess | null>(null), [rows, setRows] = useState(emptyList);
  const [status, setStatus] = useState("pending"), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true; setRows(emptyList); setAccess(null); setLoading(true); setError("");
    void feedbackRpc<FeedbackAccess>("resource_feedback_access", {}, client).then(async rights => {
      if (!active) return;
      setAccess(rights);
      if (rights.can_moderate) { const result = await feedbackRpc<FeedbackList>("list_resource_feedback_queue", { p_status: status, p_page: page }, client); if (active) setRows(result); }
    }).catch(reason => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, status, page, revision]);
  if (loading) return <p role="status">Loading review queue…</p>;
  if (error) return <div role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button></div>;
  if (!access?.can_moderate) return <p>Only active Admins and Super admins can review resource feedback.</p>;
  return <>{notice && <p role="status">{notice}</p>}<div className="feedback-actions"><label>Review status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{["pending", "approved", "rejected", "withdrawn", "all"].map(value => <option key={value}>{value}</option>)}</select></label><button onClick={() => setRevision(value => value + 1)}>Refresh queue</button></div>{!rows.items.length && <p>No feedback in this view.</p>}{rows.items.map(item => <div key={`${item.id}:${item.revision}`}><h2>{feedbackDocuments[item.document].title}</h2><FeedbackCard item={item} own><ReviewForm item={item} client={client} saved={() => { setNotice("Review saved. Only approved feedback and its public response are published."); setRevision(value => value + 1); }} /></FeedbackCard></div>)}<Pagination page={page} total={rows.total} change={setPage} label="Review queue pages" /></>;
}

export function ResourceFeedbackAdminPage({ client = supabase }: ClientProps) {
  const { account, signedIn, loading, error, refresh } = useAccount();
  const location = useLocation();
  return <article className="wrap resource-feedback"><p><Link to={feedbackBase}>Robotic actuators</Link> / Administration</p><h1>Resource feedback review</h1><p>Review comments and corrections for both documents. Approval publishes feedback; it does not edit the source documents.</p>{loading ? <p role="status">Checking account…</p> : !signedIn ? <Link to="/auth" state={{ from: location.pathname }}>Sign in to review feedback</Link> : error || !account ? <p role="alert">Account status unavailable. <button onClick={() => void refresh()}>Retry</button></p> : <FeedbackReviewQueue key={`${account.user_id}:${account.role}:${account.status}:${account.membership_level}`} client={client} />}</article>;
}
