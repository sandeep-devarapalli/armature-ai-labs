import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ExternalLink,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Field, PageHeader, Section, Status } from "../components/Primitives";
import { MemberAvatar } from "../components/MemberAvatar";
import { useApp } from "../context/AppContext";
import { safeAuthReturnPath } from "../lib/authReturnPath";
import { googleAuthEnabled, supabase } from "../lib/supabase";

export function AuthPage() {
  const { currentMember, mode, requestOtp, signInGoogle, signInDemo } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const from = safeAuthReturnPath((location.state as { from?: string } | null)?.from);

  useEffect(() => {
    if (currentMember) navigate(from, { replace: true });
  }, [currentMember, from, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await requestOtp(email, from);
      if (mode === "demo") navigate(from);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-context">
        <span className="mono">Member access · {mode}</span>
        <h1>Create your member account.</h1>
        <p>Use a secure email link to apply for membership. Once approved, you can reserve the floor and manage each booking from one workspace.</p>
        <div className="auth-points">
          <span><ShieldCheck aria-hidden="true" /> Staff approval before booking</span>
          <span><KeyRound aria-hidden="true" /> Equipment-specific certification gates</span>
          <span><LogIn aria-hidden="true" /> No password stored by Armature</span>
        </div>
      </div>
      <div className="auth-form-panel">
        <div className="mode-banner">
          <Status tone={mode === "demo" ? "warn" : "good"}>{mode} mode</Status>
          <p>{mode === "demo" ? "Actions stay in this browser. No production data is changed." : "Connected to Supabase Auth."}</p>
        </div>
        <button
          className="button button-google"
          type="button"
          disabled={!googleAuthEnabled}
          onClick={() => void signInGoogle(from).then(() => mode === "demo" && navigate(from)).catch((reason: Error) => setError(reason.message))}
        >
          <LogIn aria-hidden="true" />
          {googleAuthEnabled ? "Continue with Google" : "Google sign-in setup pending"}
        </button>
        <div className="form-divider"><span>or use an email link</span></div>
        <form onSubmit={submit}>
          <Field label="Email address">
            <div className="input-with-icon"><Mail aria-hidden="true" /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={working}>
            {working ? "Sending…" : "Email me a secure link"}
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        {mode === "demo" && (
          <button className="text-link demo-login" type="button" onClick={() => { signInDemo(); navigate(from); }}>
            Open the local member demo <ArrowRight aria-hidden="true" />
          </button>
        )}
        <p className="privacy-note">Operational and contact records stay private. Approved member profiles are public by default.</p>
      </div>
    </div>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState("Finishing secure sign-in…");
  const returnTo = safeAuthReturnPath(new URLSearchParams(location.search).get("next"));
  useEffect(() => {
    if (!supabase) {
      setMessage("Supabase is not configured. Return to the demo sign-in.");
      return;
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        setMessage(error?.message ?? "No active session was returned.");
        return;
      }
      navigate(returnTo, { replace: true });
    });
  }, [navigate, returnTo]);
  return (
    <PageHeader
      meta="Auth callback"
      title={message}
      description="This route only exchanges the provider response. It never stores provider secrets in the browser."
      actions={<Link className="button button-quiet" to="/auth" state={{ from: returnTo }}>Return to sign in</Link>}
    />
  );
}

export function MembersPage() {
  const { state } = useApp();
  const members = state.profiles.filter((profile) => profile.membershipState === "active");
  return (
    <>
      <PageHeader
        meta="Public member directory"
        title="People building on the floor."
        description="Approved profiles share work, skills, and project links. Contact details, certifications, bookings, and attendance remain private."
      />
      <Section number="01" title={`${members.length} approved profiles`}>
        <div className="member-directory">
          {members.map((member) => (
            <article className="member-row" key={member.id}>
              <MemberAvatar member={member} />
              <div>
                <span className="mono">@{member.handle}</span>
                <h3>{member.name}</h3>
                <p>{member.bio}</p>
                <div className="tag-row">{member.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              </div>
              <Link to={`/members/${member.handle}`}>Profile <ArrowRight aria-hidden="true" /></Link>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

export function PublicMemberPage() {
  const { handle } = useParams();
  const { state } = useApp();
  const member = state.profiles.find((profile) => profile.handle === handle && profile.membershipState === "active");
  if (!member) {
    return <PageHeader meta="Member profile" title="Profile not found." description="This profile may be private, pending, or no longer active." actions={<Link className="button button-quiet" to="/members">Member directory</Link>} />;
  }
  return (
    <>
      <header className="member-profile-hero">
        <div className="wrap">
          <MemberAvatar member={member} large />
          <div>
            <span className="mono">@{member.handle} · {member.organization}</span>
            <h1>{member.name}</h1>
            <p>{member.bio}</p>
          </div>
        </div>
      </header>
      <Section number="01" title="Skills and work">
        <div className="profile-public-grid">
          <div><h3>Skills</h3><div className="tag-row large">{member.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
          <div><h3>Project links</h3>
            {member.projectLinks.length ? member.projectLinks.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink aria-hidden="true" /></a>) : <p>No public project links yet.</p>}
          </div>
          <div><h3>Elsewhere</h3>
            {member.socialLinks.length ? member.socialLinks.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink aria-hidden="true" /></a>) : <p>No public social links yet.</p>}
          </div>
        </div>
      </Section>
    </>
  );
}
