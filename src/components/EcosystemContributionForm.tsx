import { useEffect, useRef, useState, type FormEvent } from "react";
import { ecosystemSectors } from "../data/bengaluruEcosystem";
import { changeEcosystemType, ecosystemEditPending, ecosystemEditPendingMessage, EcosystemEditPendingError, ecosystemNeeds, ecosystemTypeLabels, ecosystemTypes, emptyEcosystemListing, getEcosystemListing, submitEcosystemContribution, type EcosystemListing, type EcosystemListingData, type EcosystemPrimaryType } from "../lib/ecosystem";
import "./EcosystemContributions.css";

type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
type ChallengeWindow = Window & { turnstile?: TurnstileApi };

export function EcosystemChallenge({ reset, onToken }: { reset: number; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!siteKey || !container.current) return;
    let widget: string | undefined;
    let stopped = false;
    const mount = () => {
      const api = (window as ChallengeWindow).turnstile;
      if (stopped || !api || !container.current || widget !== undefined) return;
      widget = api.render(container.current, { sitekey: siteKey, action: "ecosystem_submit", size: "flexible", callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    };
    let script = document.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/"]');
    if (!script) {
      script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; document.head.appendChild(script);
    }
    script.addEventListener("load", mount); mount();
    return () => { stopped = true; script?.removeEventListener("load", mount); if (widget !== undefined) (window as ChallengeWindow).turnstile?.remove(widget); };
  }, [siteKey, reset, onToken]);
  return siteKey ? <div ref={container} className="ecosystem-challenge" /> : <p role="alert" className="form-error">Submission verification is not configured yet. Please use the GitHub contribution option.</p>;
}

const subcategories: Record<EcosystemPrimaryType, string[]> = {
  startup: ["Robotics", "Hardware", "Physical AI", "Drones & aerospace", "Space", "Electronics & embedded"],
  "research-ecosystem": ["Makerspace", "Incubator", "Accelerator", "University & research", "Community", "Government & support"],
  supplier: ["Electronics", "Mechanical parts", "Raw materials", "Tools & equipment"],
  vendor: ["Fabrication", "Manufacturing", "Testing", "Design & engineering", "IP & professional services"],
  other: ["Places", "People", "Housing", "Events", "Guides", "Other"]
};

export function EcosystemContributionForm({ initialListing, initialType, onClose }: { initialListing?: EcosystemListing | null; initialType?: string; onClose: () => void }) {
  return initialListing ? <EditAvailability key={initialListing.slug} slug={initialListing.slug} onClose={onClose} /> : <ContributionDraft key={`new:${initialType ?? ""}`} initialType={initialType} onClose={onClose} />;
}

function EditNotice({ checking, error, onCheck, onClose }: { checking: boolean; error?: string; onCheck: () => void; onClose: () => void }) {
  const notice = useRef<HTMLElement>(null);
  useEffect(() => { if (!checking) { notice.current?.focus({ preventScroll: true }); notice.current?.scrollIntoView({ block: "start", behavior: "instant" }); } }, [checking, error]);
  return <section className="atlas-edit-availability" ref={notice} tabIndex={-1} role={checking ? "status" : "alert"} aria-label="Listing edit availability"><h2>{checking ? "Checking edit availability…" : error ? "Unable to check edit availability" : "This listing is under review"}</h2>{!checking ? <p>{error || ecosystemEditPendingMessage}</p> : <p>Checking the latest review status before opening the form.</p>}<div className="button-row">{!checking ? <button className="button atlas-primary" type="button" onClick={onCheck}>{error ? "Retry status check" : "Check again"}</button> : null}<button className="button secondary" type="button" onClick={onClose}>Close</button></div></section>;
}

function EditAvailability({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [state, setState] = useState<{ checking: boolean; error: string; listing: EcosystemListing | null }>({ checking: true, error: "", listing: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ checking: true, error: "", listing: null });
    void (async () => {
      try {
        if (await ecosystemEditPending(slug)) { if (active) setState({ checking: false, error: "", listing: null }); return; }
        const listing = await getEcosystemListing(slug, true);
        if (!listing) throw new Error("This listing is no longer available for editing. Close this panel or check again later.");
        if (active) setState({ checking: false, error: "", listing });
      } catch (failure) { if (active) setState({ checking: false, error: failure instanceof Error ? failure.message : "Edit availability could not be checked. Please try again.", listing: null }); }
    })();
    return () => { active = false; };
  }, [slug, attempt]);
  return state.listing ? <ContributionDraft initialListing={state.listing} onClose={onClose} /> : <EditNotice checking={state.checking} error={state.error} onCheck={() => setAttempt(value => value + 1)} onClose={onClose} />;
}

function ContributionDraft({ initialListing, initialType, onClose }: { initialListing?: EcosystemListing | null; initialType?: string; onClose: () => void }) {
  const type = ecosystemTypes.includes(initialType as EcosystemPrimaryType) ? initialType as EcosystemPrimaryType : "startup";
  const [draft, setDraft] = useState<EcosystemListingData>(() => ({ ...emptyEcosystemListing(type), ...structuredClone(initialListing?.data ?? {}) }));
  const [permission, setPermission] = useState(false);
  const [creditMe, setCreditMe] = useState(false);
  const [creditName, setCreditName] = useState("");
  const [creditLink, setCreditLink] = useState("");
  const [token, setToken] = useState("");
  const [challengeReset, setChallengeReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [editBlocked, setEditBlocked] = useState(false);
  const [checkingBlocked, setCheckingBlocked] = useState(false);
  const [blockedCheckError, setBlockedCheckError] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const attemptedBody = useRef("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    if (!receipt) return;
    confirmationRef.current?.focus({ preventScroll: true });
    confirmationRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [receipt]);
  const update = <K extends keyof EcosystemListingData>(key: K, value: EcosystemListingData[K]) => setDraft((current) => ({ ...current, [key]: value, ...(key === "locality" && value !== current.locality ? { coordinates: undefined, locationPrecision: "City-level" as const } : {}) }));
  const field = (key: "name" | "summary" | "websiteUrl" | "sourceUrl" | "locality" | "founders" | "publicEmail" | "accessNote" | "tips" | "engageHow" | "salesChannel" | "priceLevel" | "minOrder" | "pricingModel" | "turnaround", label: string, maxLength: number, required = false, multiline = false) => <label className={multiline ? "atlas-wide" : undefined}>{label}{required ? " *" : ""}{multiline ? <textarea value={draft[key] ?? ""} required={required} maxLength={maxLength} minLength={key === "summary" ? 10 : undefined} rows={3} onChange={(event) => update(key, event.target.value)} /> : <input value={draft[key] ?? ""} required={required} maxLength={maxLength} type={key.endsWith("Url") ? "url" : key === "publicEmail" ? "email" : "text"} onChange={(event) => update(key, event.target.value)} />}</label>;

  async function checkBlockedEdit() {
    if (!initialListing || checkingBlocked) return;
    setCheckingBlocked(true); setBlockedCheckError("");
    try {
      if (await ecosystemEditPending(initialListing.slug)) return;
      if (!await getEcosystemListing(initialListing.slug, true)) throw new Error("This listing is no longer available for editing.");
      setEditBlocked(false); setError(""); setToken(""); setChallengeReset(value => value + 1);
      requestAnimationFrame(() => { titleRef.current?.focus({ preventScroll: true }); titleRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
    } catch (failure) { setBlockedCheckError(failure instanceof Error ? failure.message : "Edit availability could not be checked. Please try again."); }
    finally { setCheckingBlocked(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || editBlocked) return;
    setError("");
    if (!permission) { setError("Please confirm you have permission to share these public details."); return; }
    if (!token) { setError("Please complete the verification check before submitting."); return; }
    if (!draft.websiteUrl && !draft.sourceUrl && !draft.publicEmail && !draft.publicPhones.length) { setError("Add a public website, source link, email or phone number so admins can check the details."); return; }
    if (draft.publicPhones.some((phone) => !phone.label.trim() || !/^\+[1-9][0-9 ()-]{6,24}$/.test(phone.number))) { setError("Each public phone number needs a label and a country code, for example +91."); return; }
    const form = new FormData(event.currentTarget);
    const proposed = { ...draft, credit: creditMe ? { name: creditName, link: creditLink } : initialListing?.data.credit ?? null };
    const content = { kind: initialListing ? "update" as const : "new" as const, targetSlug: initialListing?.slug ?? null, baseRevision: initialListing?.revision ?? null, proposed, submitterName: String(form.get("submitterName") ?? ""), submitterEmail: String(form.get("submitterEmail") ?? ""), permissionToShare: permission, creditMe, companyFax: String(form.get("companyFax") ?? "") };
    const signature = JSON.stringify(content);
    if (attemptedBody.current && attemptedBody.current !== signature) idempotencyKey.current = crypto.randomUUID();
    attemptedBody.current = signature;
    setBusy(true);
    try { setReceipt(await submitEcosystemContribution({ ...content, idempotencyKey: idempotencyKey.current, turnstileToken: token })); }
    catch (failure) { if (failure instanceof EcosystemEditPendingError) setEditBlocked(true); else setError(failure instanceof Error ? failure.message : "Your submission was not confirmed. Please retry."); setToken(""); setChallengeReset((current) => current + 1); }
    finally { setBusy(false); }
  }

  return <section className="atlas-contribution" aria-labelledby="atlas-contribution-title">
    <button type="button" className="button secondary" onClick={onClose}>Back to the atlas</button>
    {receipt ? <div className="atlas-confirmation" role="status"><h2 ref={confirmationRef} tabIndex={-1}>Submitted for admin review</h2><p>Your details have been saved privately. Nothing is published until an admin approves it.</p><p>Receipt: <strong>{receipt}</strong></p><p>If you supplied an email, admins can use it for questions. You do not need an account.</p><button className="button" onClick={onClose}>Return to the atlas</button></div> : <>
      <h2 id="atlas-contribution-title" ref={titleRef} tabIndex={-1}>{initialListing ? `Suggest an edit to ${initialListing.data.name}` : "Submit a startup or place"}</h2>
      <p>Anyone can contribute. No account or membership needed.</p>
      {editBlocked ? <EditNotice checking={checkingBlocked} error={blockedCheckError} onCheck={() => void checkBlockedEdit()} onClose={onClose} /> : null}
      <div className="atlas-contribution-layout" hidden={editBlocked}><form onSubmit={submit} className="atlas-contribution-form">
        <fieldset disabled={busy}><legend>About this listing</legend><div className="atlas-field-grid">
          {field("name", "Organisation, place or resource name", 160, true)}
          <label>Type *<select value={draft.primaryType} onChange={(event) => setDraft(changeEcosystemType(draft, event.target.value as EcosystemPrimaryType))}>{ecosystemTypes.map((value) => <option key={value} value={value}>{ecosystemTypeLabels[value]}</option>)}</select></label>
          {field("summary", "What does it build or offer?", 2000, true, true)}
          <label>Category<select value={draft.subcategory} onChange={(event) => { const subcategory = event.target.value; setDraft({ ...draft, subcategory, ...(draft.primaryType === "other" && /people|housing/i.test(subcategory) ? { coordinates: undefined, locationPrecision: "City-level" as const } : {}) }); }}><option value="">Choose a category</option>{draft.subcategory && !subcategories[draft.primaryType].includes(draft.subcategory) ? <option value={draft.subcategory}>{draft.subcategory}</option> : null}{subcategories[draft.primaryType].map((value) => <option key={value}>{value}</option>)}</select></label>
          {field("locality", "Locality / area (leave blank if unknown)", 300)}
          {field("websiteUrl", "Website or public profile", 1000)}{field("sourceUrl", "Source link for review", 1000, draft.primaryType === "startup")}
          {draft.primaryType === "startup" ? field("founders", "Founders (public professional information only)", 500) : null}
          {draft.primaryType === "research-ecosystem" ? field("engageHow", "How can builders use or engage with it?", 1000, false, true) : null}
          {draft.primaryType === "supplier" ? <>{field("salesChannel", "How to buy", 500)}{field("priceLevel", "Price guidance, if known", 300)}{field("minOrder", "Minimum order, if known", 300)}</> : null}
          {draft.primaryType === "vendor" ? <>{field("pricingModel", "Pricing model, if known", 500)}{field("turnaround", "Turnaround, if known", 300)}</> : null}
          {field("accessNote", "Access requirements or important caveats", 2000, false, true)}{field("tips", "Useful details or a correction to the location", 2000, false, true)}
        </div><p className="atlas-help">Unknown locations remain unpinned. For people, share only public professional details. Do not add private residential addresses.</p>
        <details><summary>Topics and builder needs</summary><p className="atlas-help">Only select pilot if openness to external pilots is supported by your source.</p><div className="atlas-check-grid">{ecosystemNeeds.map((need) => <label key={need}><input type="checkbox" checked={draft.needs.includes(need)} onChange={(event) => update("needs", event.target.checked ? [...draft.needs, need] : draft.needs.filter((value) => value !== need))} />{need}</label>)}</div><h3>Topics</h3><div className="atlas-check-grid">{ecosystemSectors.map((sector) => <label key={sector}><input type="checkbox" checked={draft.sectors.includes(sector)} onChange={(event) => update("sectors", event.target.checked ? [...draft.sectors, sector] : draft.sectors.filter((value) => value !== sector))} />{sector}</label>)}</div><h3>Also useful as</h3><div className="atlas-check-grid">{ecosystemTypes.filter((value) => value !== draft.primaryType).map((value) => <label key={value}><input type="checkbox" checked={draft.alsoListedAs.includes(value)} onChange={(event) => update("alsoListedAs", event.target.checked ? [...draft.alsoListedAs, value] : draft.alsoListedAs.filter((item) => item !== value))} />{ecosystemTypeLabels[value]}</label>)}</div></details></fieldset>
        <fieldset disabled={busy}><legend>Public contact details</legend><p className="atlas-help">Only add business or facility numbers you have permission to publish.</p>{draft.publicPhones.map((phone, index) => <div className="atlas-phone-row" key={index}><label>Phone {index + 1}<input type="tel" required placeholder="+91 …" maxLength={26} value={phone.number} onChange={(event) => update("publicPhones", draft.publicPhones.map((value, position) => position === index ? { ...value, number: event.target.value } : value))} /></label><label>Phone {index + 1} label<input required maxLength={60} placeholder="Reception, workshop, sales…" value={phone.label} onChange={(event) => update("publicPhones", draft.publicPhones.map((value, position) => position === index ? { ...value, label: event.target.value } : value))} /></label><button type="button" className="button secondary" aria-label={`Remove phone ${index + 1}`} onClick={() => update("publicPhones", draft.publicPhones.filter((_, position) => position !== index))}>Remove</button></div>)}<button type="button" className="button secondary" disabled={draft.publicPhones.length >= 5} onClick={() => update("publicPhones", [...draft.publicPhones, { label: "", number: "" }])}>Add a phone number</button>{field("publicEmail", "Public business email", 254)}</fieldset>
        <fieldset disabled={busy}><legend>Your contact (private, optional)</legend><p className="atlas-help">Only admins can use these details for follow-up. They are never copied into the public listing or credit.</p><div className="atlas-field-grid"><label>Your name<input name="submitterName" maxLength={120} autoComplete="name" /></label><label>Your email<input name="submitterEmail" type="email" maxLength={254} autoComplete="email" /></label></div><label className="atlas-check"><input type="checkbox" checked={creditMe} onChange={(event) => setCreditMe(event.target.checked)} />Credit me publicly for this contribution (optional)</label>{creditMe ? <div className="atlas-field-grid"><label>Public credit name<input required value={creditName} maxLength={120} onChange={(event) => setCreditName(event.target.value)} /></label><label>Public credit link (optional)<input type="url" value={creditLink} maxLength={1000} onChange={(event) => setCreditLink(event.target.value)} /></label></div> : null}
        <label className="atlas-check"><input required type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} />I have permission to share these details and any contact numbers for public display.</label>
        <div className="atlas-honeypot" aria-hidden="true"><label>Company fax<input name="companyFax" tabIndex={-1} autoComplete="off" /></label></div>
        <EcosystemChallenge reset={challengeReset} onToken={setToken} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="button-row"><button className="button atlas-primary" type="submit" disabled={busy}>{busy ? "Saving your submission…" : "Submit for admin review"}</button><button className="button secondary" type="button" onClick={onClose}>Cancel</button></div>
        <p className="atlas-help">Your submission stays private until approval. Abuse-control hashes expire after 24 hours; private follow-up contacts are removed 90 days after review closes. <a href="/privacy">Privacy notice</a>.</p></fieldset>
      </form><aside className="atlas-contribution-next"><h3>What happens next</h3><ol><li><strong>Send your details</strong><p>No member login required.</p></li><li><strong>Admin review</strong><p>We check the information, sources and any public phone numbers.</p></li><li><strong>Published after approval</strong><p>Approved details appear in the atlas. Nothing is published automatically.</p></li></ol><a href="https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/docs/ecosystem-contributions.md" target="_blank" rel="noreferrer">Prefer GitHub? Contribute there</a></aside></div>
    </>}
  </section>;
}
