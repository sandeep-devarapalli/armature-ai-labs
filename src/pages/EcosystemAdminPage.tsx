import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { PageHeader } from "../components/Primitives";
import { ecosystemChanges, getEcosystemListing, getEcosystemSubmissions, rebaseEcosystemSubmission, reviewEcosystemSubmission, type EcosystemListing, type EcosystemListingData, type EcosystemSubmission } from "../lib/ecosystem";
import "../components/EcosystemContributions.css";

const labels: Record<string, string> = { primaryType: "Type", alsoListedAs: "Also listed as", publicPhones: "Public phone numbers", publicEmail: "Public email", websiteUrl: "Website", sourceUrl: "Source evidence", accessNote: "Access caveats", engageHow: "How to engage", verifiedAt: "Source-check date", locationPrecision: "Location precision", locationConfidence: "Location evidence", credit: "Public contributor credit" };
const display = (value: unknown) => value === null || value === undefined || value === "" || Array.isArray(value) && !value.length ? "Not provided / removed" : typeof value === "string" ? value : JSON.stringify(value, null, 2);

export function mergeEcosystemProposal(submission: EcosystemSubmission, current: EcosystemListingData, choices: Partial<Record<keyof EcosystemListingData, "current" | "proposed">>) {
  const merged = { ...current };
  for (const key of ecosystemChanges(submission.base_data, submission.proposed)) {
    if (choices[key] !== "current") Object.assign(merged, { [key]: submission.proposed[key] });
  }
  return merged;
}

export function EcosystemAdminPage() {
  const { isAdmin } = useApp();
  const [submissions, setSubmissions] = useState<EcosystemSubmission[]>([]);
  const [selected, setSelected] = useState<EcosystemSubmission | null>(null);
  const [current, setCurrent] = useState<EcosystemListing | null>(null);
  const [choices, setChoices] = useState<Partial<Record<keyof EcosystemListingData, "current" | "proposed">>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [notesRequired, setNotesRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("pending");
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  const detail = useRef<HTMLHeadingElement>(null);
  const reviewNotes = useRef<HTMLTextAreaElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const selection = useRef(0);

  useEffect(() => {
    if (!error) return;
    const target = notesRequired ? reviewNotes.current : errorNotice.current;
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [error, notesRequired]);

  useEffect(() => {
    const generation = ++request.current;
    setSubmissions([]); setSelected(null); setCurrent(null);
    if (!isAdmin) return;
    setLoading(true); setError("");
    getEcosystemSubmissions().then((rows) => { if (generation === request.current) setSubmissions(rows); }).catch((failure) => { if (generation === request.current) setError(failure.message); }).finally(() => { if (generation === request.current) setLoading(false); });
    return () => { request.current++; selection.current++; };
  }, [isAdmin, refresh]);

  async function select(submission: EcosystemSubmission) {
    const generation = ++selection.current;
    setSelected(null); setCurrent(null); setChoices({}); setNotes(submission.reviewer_notes ?? ""); setNotesRequired(false); setError(""); setMessage(""); setBusy(true);
    try {
      const listing = submission.target_slug ? await getEcosystemListing(submission.target_slug) : null;
      if (generation !== selection.current) return;
      setCurrent(listing); setSelected(submission);
      requestAnimationFrame(() => { detail.current?.scrollIntoView({ block: "start", behavior: "smooth" }); detail.current?.focus({ preventScroll: true }); });
    } catch (failure) { if (generation === selection.current) setError(failure instanceof Error ? failure.message : "Could not open this submission."); }
    finally { if (generation === selection.current) setBusy(false); }
  }

  const stale = selected?.kind === "update" && current?.revision !== selected.base_revision;
  const changed = selected ? ecosystemChanges(selected.base_data, selected.proposed) : [];
  const conflicts = selected && current ? changed.filter((key) => JSON.stringify(selected.base_data?.[key] ?? null) !== JSON.stringify(current.data[key] ?? null) && JSON.stringify(selected.proposed[key] ?? null) !== JSON.stringify(current.data[key] ?? null)) : [];
  const reviewable = selected?.status === "pending" || selected?.status === "needs_info";
  const missingPermission = selected && !selected.contacts_permission && (!!selected.proposed.publicEmail || !!selected.proposed.publicPhones?.length);

  async function decide(decision: "approved" | "needs_info" | "rejected") {
    if (!selected || busy) return;
    if (decision !== "approved" && !notes.trim()) {
      setNotesRequired(true); setError("Add a review note explaining what is needed or why this was rejected.");
      reviewNotes.current?.focus();
      return;
    }
    setBusy(true); setNotesRequired(false); setError("");
    try {
      await reviewEcosystemSubmission(selected.id, decision, current?.revision ?? null, notes, selected.proposal_revision);
      setMessage(decision === "approved" ? "Approved and published. The review and listing were saved together." : decision === "needs_info" ? "Marked as needing information. No public information changed." : "Rejected. No public information changed.");
      setRefresh((value) => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The review could not be saved."); }
    finally { setBusy(false); }
  }

  async function rebase() {
    if (!selected || !current || conflicts.some((key) => !choices[key])) return;
    setBusy(true); setNotesRequired(false); setError("");
    try {
      await rebaseEcosystemSubmission(selected.id, current.revision, mergeEcosystemProposal(selected, current.data, choices), selected.proposal_revision);
      setMessage("Proposal updated against the current listing. Open it again and review the differences before approval."); setRefresh((value) => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The proposal could not be updated."); }
    finally { setBusy(false); }
  }

  if (!isAdmin) return <PageHeader title="Admin access required" description="Only Admins and Super admins can review ecosystem contributions." />;
  return <><PageHeader title="Ecosystem review" description="Check sources, public-contact permission and location evidence before approving. Contributions remain private until approval." meta="Administration" /><section className="section"><div className="wrap">
    <div className="button-row"><label>Review status <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="pending">Pending</option><option value="needs_info">Needs information</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></select></label><button className="button secondary" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh review queue</button></div>
    {error && !selected ? <p ref={errorNotice} tabIndex={-1} className="form-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}{loading ? <p role="status">Loading private review queue…</p> : null}
    <div className="atlas-review-layout"><div className="atlas-review-list" aria-label="Submissions">{submissions.filter((row) => filter === "all" || row.status === filter).map((row) => <button type="button" className={`button ${selected?.id === row.id ? "" : "secondary"}`} key={row.id} disabled={busy} onClick={() => void select(row)}><strong>{row.proposed.name}</strong><span>{row.kind === "new" ? "New listing" : "Suggested edit"} · {row.status.replace("_", " ")}</span><small>{new Date(row.created_at).toLocaleDateString("en-IN")}</small></button>)}{!loading && !submissions.some((row) => filter === "all" || row.status === filter) ? <p>No matching submissions.</p> : null}</div>
      {selected ? <article className="atlas-review-detail"><h2 ref={detail} tabIndex={-1}>{selected.proposed.name}</h2><p>Receipt: {selected.id}</p><p>Private follow-up: {selected.submitter_name || "Name not supplied"} · {selected.submitter_email || "No email supplied"}</p><p>Public-contact permission: {selected.contacts_permission ? "Confirmed by contributor" : "Not supplied"}. Independently check that contacts are appropriate to publish.</p><p>No automatic follow-up is sent by these review actions.</p>
        {selected.proposed.sourceUrl ? <p><a href={selected.proposed.sourceUrl} target="_blank" rel="noreferrer">Open submitted source evidence</a></p> : null}
        {stale ? <div className="atlas-review-warning"><h3>This listing changed after submission</h3><p>Unchanged fields will keep the latest published values. For each conflict below, explicitly choose what to retain. Saving the revised proposal does not publish it.</p>{!current ? <p>The target listing is unavailable. Approval is blocked; refresh or reject this suggestion.</p> : null}</div> : null}
        <p>Blank proposed values explicitly remove a field. Fields not changed by this proposal remain as shown in the current listing.</p>
        <div className="atlas-review-diff">{changed.map((key) => <section className="atlas-review-field" key={key}><h3>{labels[key] ?? key}</h3><div className="atlas-review-values"><div><strong>Current public value</strong><pre>{display(current?.data[key])}</pre></div><div><strong>Proposed value</strong><pre>{display(selected.proposed[key])}</pre></div></div>{stale && conflicts.includes(key) ? <fieldset><legend>Resolve this conflict</legend><label><input type="radio" name={`conflict-${key}`} checked={choices[key] === "current"} onChange={() => setChoices({ ...choices, [key]: "current" })} />Keep current value</label><label><input type="radio" name={`conflict-${key}`} checked={choices[key] === "proposed"} onChange={() => setChoices({ ...choices, [key]: "proposed" })} />Use proposed value</label></fieldset> : null}</section>)}</div>
        <details><summary>All proposed public details</summary><div className="atlas-review-diff">{Object.entries(selected.proposed).map(([key, value]) => <div className="atlas-review-field" key={key}><strong>{labels[key] ?? key}</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{display(value)}</pre></div>)}</div></details>
        <label>Private review notes<textarea ref={reviewNotes} value={notes} maxLength={2000} disabled={busy || !reviewable} aria-invalid={notesRequired || undefined} aria-describedby={`ecosystem-review-notes-help${error ? " ecosystem-review-error" : ""}`} onChange={(event) => { setNotes(event.target.value); if (notesRequired) { setNotesRequired(false); setError(""); } }} /></label>
        <p id="ecosystem-review-notes-help">A note is required for Reject or Needs information; optional for approval.</p>
        {error ? <p id="ecosystem-review-error" ref={errorNotice} tabIndex={-1} className="form-error" role="alert">{error}</p> : null}
        {missingPermission ? <p role="alert">Public contacts cannot be approved without recorded publication permission.</p> : null}
        {reviewable ? <div className="button-row">{stale ? <button className="button" disabled={busy || !current || conflicts.some((key) => !choices[key])} onClick={() => void rebase()}>Save revised proposal for re-review</button> : <button className="button" disabled={busy || !!missingPermission} onClick={() => void decide("approved")}>Approve and publish</button>}<button className="button secondary" disabled={busy} onClick={() => void decide("needs_info")}>Needs information</button><button className="button secondary" disabled={busy} onClick={() => void decide("rejected")}>Reject</button></div> : <p>This review is closed. Public changes require a new suggestion.</p>}
      </article> : <p>Select a contribution to review its details.</p>}
    </div>
  </div></section></>;
}
