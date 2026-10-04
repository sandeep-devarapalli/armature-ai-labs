import { authDesignPreviewEnabled } from "../config/authDesignPreview";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Field, PageHeader, Section } from "../components/Primitives";
import { MemberAvatar } from "../components/MemberAvatar";
import { useApp } from "../context/AppContext";
import { basicOnboardingAvailable, memberPlatformAvailable } from "../config/release";
import { onboardingAuthReturnPath } from "../lib/authReturnPath";
import { googleAuthEnabled, supabase } from "../lib/supabase";

import "./signup-editorial.css";

export function AuthPage({ redirectTo }: { redirectTo?: string } = {}) {
  const { currentMember, mode, requestOtp, signInGoogle, signInDemo } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const from = onboardingAuthReturnPath(redirectTo ?? (location.state as { from?: string } | null)?.from, basicOnboardingAvailable && !memberPlatformAvailable);

  useEffect(() => {
    if (currentMember) navigate(from, { replace: true });
  }, [currentMember, from, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (working || authDesignPreviewEnabled) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await requestOtp(email, from);
      if (mode === "demo") navigate(from);
      else setNotice("Check your inbox for your secure sign-in link. You can close this page after opening the link.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  async function continueWithGoogle() {
    if (working || authDesignPreviewEnabled) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await signInGoogle(from);
      if (mode === "demo") navigate(from);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google sign-in failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="signup-editorial">
      <section className="signup-introduction" aria-labelledby="signup-title">
        <span className="mono">Membership</span>
        <h1 id="signup-title">Join Armature <br />AI Labs.</h1>
        <p className="signup-lede">A community for people building in robotics and physical AI.</p>
        <div className="signup-next">
          <p>One free account.</p>
          <p>Complete your profile and identity review to become a verified member.</p>
        </div>
      </section>
      <section className="signup-panel" aria-labelledby="signup-form-title">
        <div className="signup-form-content">
          <h2 id="signup-form-title">Create your free account</h2>
          {authDesignPreviewEnabled && <p className="signup-demo-note" role="status">Design preview only. Sign-in and registration are disabled here; no emails are sent.</p>}
          {mode === "demo" && <p className="signup-demo-note">Local demo. Actions stay in this browser; no production data is changed.</p>}
          <button
            className="button signup-google"
            type="button"
            disabled={authDesignPreviewEnabled || !googleAuthEnabled || working}
            onClick={() => void continueWithGoogle()}
          >
            <svg className="signup-google-mark" aria-hidden="true" viewBox="0 0 48 48" width="20" height="20">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
            {googleAuthEnabled ? "Continue with Google" : "Google sign-in setup pending"}
          </button>
          <div className="signup-divider"><span>or</span></div>
          <form onSubmit={submit} aria-label="Email sign-in">
            <Field label="Email address">
              <input type="email" disabled={authDesignPreviewEnabled} required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </Field>
            {error && <p className="signup-error" role="alert">{error}</p>}
            {notice && <p className="signup-notice" role="status">{notice}</p>}
            <button className="button signup-submit" type="submit" disabled={authDesignPreviewEnabled || working}>
              {working ? "Sending…" : "Email me a secure link"}
            </button>
            <p className="signup-password-note">No password needed.</p>
          </form>
          <p className="signup-existing"><Link to="/auth" state={{ from }}>Already registered? Sign in</Link></p>
          {mode === "demo" && (
            <button className="text-link signup-demo-login" type="button" onClick={() => { signInDemo(); navigate(from); }}>
              Open the local member demo <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="signup-fine-print">Basic registration is free. Paid space and equipment access are separate. <Link to="/privacy">Privacy notice</Link></p>
      </section>
    </div>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState("Finishing secure sign-in…");
  const returnTo = onboardingAuthReturnPath(new URLSearchParams(location.search).get("next"), basicOnboardingAvailable && !memberPlatformAvailable);
  useEffect(() => {
    const parameters = [
      new URLSearchParams(location.search),
      new URLSearchParams(location.hash.slice(1))
    ];
    if (parameters.some((params) => ["error", "error_code", "error_description"].some((key) => params.has(key)))) {
      setMessage("Sign-in was not completed. Please return to sign in and try again.");
      return;
    }
    if (!supabase) {
      setMessage("Supabase is not configured. Return to the demo sign-in.");
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        setMessage(error?.message ?? "No active session was returned.");
        return;
      }
      navigate(returnTo, { replace: true });
    }).catch(() => {
      if (active) setMessage("We could not finish sign-in. Please return to sign in and try again.");
    });
    return () => { active = false; };
  }, [location.search, location.hash, navigate, returnTo]);
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
