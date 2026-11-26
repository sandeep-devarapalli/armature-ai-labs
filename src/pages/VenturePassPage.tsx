import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Status } from "../components/Primitives";
import { legalEntity } from "../data/legalEntity";
import { useAccount } from "../context/AccountContext";
import {
  venturePayment, ventureRequest, ventureStatuses, ventureTime, type VentureApplication,
} from "../lib/venture-pass";
import "./VenturePassPage.css";

const returnPath = "/venture-partner-pass/?payment=return#apply";
const angles = Array.from({ length: 18 }, (_, index) => index * 10);
const benefits = [
  { id: "directory", title: "Find founders early.", copy: "Explore founder-approved profiles from Armature and participating HSR Founders Club hardware and physical AI founders. See what they’re building and where they’re looking for help.", label: "Founder directory", facts: ["What they’re building", "Prototype stage", "Founder-approved introductions"] },
  { id: "fellowship", title: "See prototypes before Demo Day.", copy: "Get first invitations to private Hardware Fellowship previews and explore co-branding a fellowship session.", label: "Hardware Fellowship", facts: ["Fellowship", "Partner preview", "Demo Day"] },
  { id: "events", title: "Give portfolio founders a stage.", copy: "Use four hosted events to put your founders alongside startups, operators, and ecosystem partners. Armature helps with planning, invitations, rehearsal, setup, and standard AV.", label: "Four events a year", facts: ["Demo day", "Roundtable", "Panel", "Mixer"] },
  { id: "podcasts", title: "Turn a conversation into an episode.", copy: "Use four video podcast slots to feature portfolio founders or your team. Armature films, fully edits, and publishes each episode on the Armature AI Labs YouTube channel.", label: "Four episodes a year", facts: ["Film", "Edit", "Publish on YouTube"] },
  { id: "visibility", title: "Reach beyond the room.", copy: "Share founders’ work through Armature’s event coverage, website, LinkedIn, and YouTube. When both sides want to connect, Armature can help make introductions to relevant pilot customers, collaborators, or investors.", label: "Partner visibility", facts: ["Year-round website listing", "LinkedIn banner spotlight around your flagship event", "Credit on event invitations and recaps"] },
  { id: "lab", title: "Make the lab part of your week.", copy: "Bring your team in for founder meetings and hands-on portfolio sessions. Desk bookings depend on availability.", label: "Team and portfolio access", facts: ["Up to 5 named team members", "5 shared desk-days per month", "Two private lab sessions per year for portfolio startups", "Quarterly showcases shared by all four partner firms"] },
] as const;

function OrbitFigure() {
  return <figure className="venture-orbit">
    <svg viewBox="0 0 620 366" aria-hidden="true">
      <g transform="translate(310 183) scale(1 .64)" className="venture-mesh">
        {angles.map(angle => <ellipse key={angle} rx="234" ry="69" transform={`rotate(${angle})`} />)}
      </g>
      <path className="venture-guide" d="M28 183H592M310 17V349" />
      <path className="venture-trajectory" d="M115 237Q206 244 310 183T510 112" />
      {[[115, 237], [310, 183], [510, 112]].map(([x, y]) => <g key={x}>
        <circle className="venture-node-halo" cx={x} cy={y} r="14" />
        <circle className="venture-node" cx={x} cy={y} r="5" />
      </g>)}
    </svg>
    <figcaption>Discover → Preview → Showcase</figcaption>
  </figure>;
}

function BenefitFigure({ item }: { item: (typeof benefits)[number] }) {
  if (item.id === "fellowship") return <figure className="venture-process">
    <svg viewBox="0 0 560 200" aria-hidden="true">
      <path className="venture-guide" d="M32 150H528M120 24V176M280 24V176M440 24V176" />
      <path className="venture-trajectory" d="M120 139C176 139 218 88 280 88S388 48 440 48" />
      <circle className="venture-node" cx="120" cy="139" r="6" />
      <circle className="venture-node-halo" cx="280" cy="88" r="16" />
      <circle className="venture-node" cx="280" cy="88" r="6" />
      <circle className="venture-node" cx="440" cy="48" r="6" />
    </svg>
    <figcaption>{item.facts.map(fact => <span key={fact}>{fact}</span>)}</figcaption>
  </figure>;
  if (item.id === "podcasts") return <figure className="venture-process venture-signal">
    <svg viewBox="0 0 560 145" aria-hidden="true">
      {Array.from({ length: 91 }, (_, index) => {
        const x = 10 + index * 6;
        const envelope = 52 * Math.exp(-((index - 45) ** 2) / 865);
        const height = 3 + envelope * (0.38 + 0.62 * Math.abs(Math.sin(index * .53) * Math.cos(index * .24)));
        return <line key={x} x1={x} x2={x} y1={72.5 - height} y2={72.5 + height}
          className={index % 7 === 0 ? "venture-trajectory" : "venture-signal-stroke"} />;
      })}
    </svg>
    <figcaption>{item.facts.map(fact => <span key={fact}>{fact}</span>)}</figcaption>
  </figure>;
  return <figure className="venture-benefit-figure">
    <figcaption>{item.label}</figcaption>
    <ul>{item.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
  </figure>;
}

function VentureDistributionProof() {
  return <div className="venture-distribution-proof" role="group" aria-label="Venture Partner Pass at a glance">
    <ul className="venture-distribution-scale" aria-label="Lab and network">
      <li>
        <svg className="venture-bench-icon" viewBox="0 0 108 60" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 36h90v5H9z M16 41v15m76-15v15M16 50h76" />
          <path d="M20 36h18m-9 0V24l11-14m0 0 10 7m-10-7 3-4 10 8-3 7-12-7" />
          <path d="M58 36V23h23v13m-18-9v5m5-5v5m5-5v5m5-5v5M67 23v-4h8v4" />
          <path d="M87 36v-9m-4 0h8m-6-4h4" />
        </svg>
        <span>Lab in HSR Layout</span>
      </li>
      <li><strong>1,000+</strong><span>Founders and builders in the network</span></li>
    </ul>
    <div className="venture-distribution-capabilities">
      <h3>For your portfolio</h3>
      <ul><li>Rapid prototyping</li><li>Product development</li><li>Research</li><li>Talent</li></ul>
    </div>
  </div>;
}

export default function VenturePassPage() {
  const { account, loading, signedIn } = useAccount();
  const { search } = useLocation();
  const returned = new URLSearchParams(search).get("payment") === "return";
  useEffect(() => {
    if (returned) document.getElementById("apply")?.scrollIntoView?.();
  }, [returned]);
  return <div className="venture-page">
    <header className="page-hero">
      <div className="wrap venture-grid">
        <div>
          <h1>Venture Partner Pass</h1>
          <p className="hero-copy">For institutional investors and venture teams looking to back physical AI, robotics, and hardware startups.</p>
          <div className="button-row">
            <a className="button button-primary" href="#apply">Talk to us</a>
            <a className="button button-quiet" href="#venture-benefits">Explore the pass</a>
          </div>
        </div>
        <OrbitFigure />
      </div>
    </header>
    <section className="wrap venture-distribution" aria-labelledby="venture-distribution-title">
      <h2 id="venture-distribution-title">Physical AI won't be found in pitch decks. It'll be found on benches.</h2>
      <div className="venture-distribution-copy">
        <p>Armature gives your portfolio a lab for rapid prototyping, product development and research, plus a talent network to hire from.</p>
        <p>It also puts them in front of 1,000+ physical AI and hardware founders, engineers and builders across our community.</p>
        <p>Four venture firms a year get a first look at what's being built, and a stage for their own companies.</p>
      </div>
      <VentureDistributionProof />
    </section>
    <div className="wrap venture-grid venture-journey">
      <div><h2>Discover</h2><p>Find teams in a founder-approved directory.</p></div>
      <div><h2>Preview</h2><p>See fellowship prototypes before Demo Day.</p></div>
      <div><h2>Showcase</h2><p>Put portfolio teams on stage, on camera, and in front of people who can help.</p></div>
    </div>
    <div className="wrap" id="venture-benefits">
      <nav className="venture-chapter-nav" aria-label="Explore the pass">
        <a href="#directory">Directory</a><a href="#fellowship">Fellowship</a><a href="#events">Events</a>
        <a href="#podcasts">Podcasts</a><a href="#visibility">Distribution</a><a href="#lab">Lab access</a>
      </nav>
      {benefits.map(item => <section className={`venture-grid venture-chapter ${item.id === "events" || item.id === "podcasts" ? "venture-chapter-wide" : ""}`} key={item.id} id={item.id}>
        <div className="section-heading"><h2>{item.title}</h2><p>{item.copy}</p></div>
        <BenefitFigure item={item} />
      </section>)}
      <dl className="venture-terms" aria-label="Annual terms">
        <div><dt>Annual membership</dt><dd>₹5,00,000 per firm</dd></div>
        <div><dt>Annual cohort</dt><dd>Four firms</dd></div>
        <div><dt>Renewal window</dt><dd>December</dd></div>
      </dl>
      <section className="venture-contact" id="apply" aria-labelledby="venture-contact-title">
        <div>
          <h2 id="venture-contact-title">Let’s talk partnership.</h2>
          <p>Tell us about your firm and what you’d like to do for your founders. We’d love to hear from you.</p>
        </div>
        <div className="venture-contact-links">
          <a href={`mailto:${legalEntity.email}?subject=Venture%20Partner%20Pass`}>
            <span>Email the lab</span><strong>{legalEntity.email}</strong><span aria-hidden="true">↗</span>
          </a>
          <a href={`tel:${legalEntity.phone.replace(/\s/g, "")}`}>
            <span>Call the lab</span><strong>{legalEntity.phone}</strong><span aria-hidden="true">↗</span>
          </a>
        </div>
        <Link className="venture-contact-policy" to="/refund-policy#venture-refunds">Refund policy</Link>
      </section>
      {signedIn && account ? <VentureApplicationStatus key={account.user_id} returned={returned} />
        : returned && !loading && !signedIn && <Link className="button button-quiet" to={"/auth?next=" + encodeURIComponent(returnPath)}>Sign in to check your payment status</Link>}
    </div>
  </div>;
}

function VentureApplicationStatus({ returned }: { returned: boolean }) {
  const [application, setApplication] = useState<VentureApplication | null | undefined>();
  const [checking, setChecking] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setError("");
    const load = returned
      ? venturePayment("refresh").then(result => {
        if (active) setConfirmationPending(result.confirmationPending === true);
        return result.application;
      })
      : ventureRequest<VentureApplication | null>("get_my_venture_pass_application");
    void load.then(row => { if (active) setApplication(row); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [returned, revision]);

  const deadline = Date.parse(application?.payment_expires_at ?? "");
  useEffect(() => {
    if (application?.status !== "approved" || !Number.isFinite(deadline)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [application?.status, deadline]);

  async function run(operation: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    setError("");
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); }
    finally { inFlight.current = false; setChecking(false); }
  }

  function pay() {
    if (!acceptedTerms) return;
    void run(async () => {
      const result = await venturePayment("checkout");
      setApplication(result.application);
      setConfirmationPending(result.confirmationPending === true);
      if (result.checkoutUrl && /^https:\/\/rzp\.io\//.test(result.checkoutUrl)) {
        window.location.assign(result.checkoutUrl);
      } else if (result.application?.status !== "confirmed" && result.application?.status !== "expired" && !result.confirmationPending) {
        throw new Error("Checkout isn’t available yet. Check your payment status before trying again.");
      }
    });
  }

  if (application === undefined) return error ? <div className="venture-status-panel">
    <p role="alert">{error}</p><button className="button button-quiet" onClick={() => setRevision(value => value + 1)}>Try again</button>
  </div> : returned ? <p role="status">Checking your payment…</p> : null;

  if (!application) return null;

  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  const payOpen = application.status === "approved" && secondsLeft > 0;
  const refresh = () => void run(async () => {
    if (application.status === "approved" || application.status === "expired" || returned) {
      const result = await venturePayment("refresh");
      setApplication(result.application);
      setConfirmationPending(result.confirmationPending === true);
    } else {
      setApplication(await ventureRequest<VentureApplication | null>("get_my_venture_pass_application"));
    }
  });
  return <section className="venture-status-panel" aria-label="Existing Venture Partner Pass application">
    <Status tone={application.status === "confirmed" ? "good" : application.status === "approved" ? "warn" : "neutral"}>
      {application.status === "approved" && !payOpen ? "Payment window ended" : ventureStatuses[application.status]}
    </Status>
    <h3>{application.firm_name}</h3>
    <p>Application reference {application.id}</p>
    {application.status === "pending" && <p>We’ve received your application. Staff will review it and email you if it’s approved.</p>}
    {application.status === "approved" && Number.isFinite(deadline) && <>
      <p>Payment deadline <strong>{ventureTime.format(deadline)} IST</strong></p>
      {payOpen ? <p role="timer">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} remaining</p>
        : <p>If you already paid, check your payment status. Contact Armature about a new window if needed.</p>}
    </>}
    {application.status === "expired" && <p>Contact Armature if you’d like to ask about another payment window.</p>}
    {application.status === "confirmed" && application.confirmed_at && <p role="status">Payment of ₹5,00,000 verified on {ventureTime.format(new Date(application.confirmed_at))} IST.</p>}
    {confirmationPending && <p role="status">Razorpay is still verifying this payment. Refresh to check the confirmation.</p>}
    {error && <p role="alert">{error}</p>}
    {payOpen && !confirmationPending && <div className="venture-consent">
      <input type="checkbox" id="venture-terms" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} />
      <div><label htmlFor="venture-terms">I accept the website terms.</label> <Link to="/terms" target="_blank" rel="noreferrer">Read terms</Link></div>
    </div>}
    <div className="button-row">
      {payOpen && !confirmationPending && <button className="button button-primary" disabled={checking || !acceptedTerms} onClick={pay}>Pay ₹5,00,000 with Razorpay</button>}
      {application.status !== "confirmed" && application.status !== "declined" && <button className="button button-quiet" disabled={checking} onClick={refresh}>
        {checking ? "Checking…" : "Refresh status"}
      </button>}
    </div>
  </section>;
}
