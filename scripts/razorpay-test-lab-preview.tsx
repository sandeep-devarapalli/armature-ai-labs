import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import "../src/editorial.css";
import "../src/pixel-system.css";

const root = document.getElementById("root")!;
const fixtureEmail = "razorpay-local-admin@example.test";
const fixturePassword = "Local-Test-Only-57441!";
const backend = import.meta.env.VITE_SUPABASE_URL?.trim();
const localPage = window.location.protocol === "http:"
  && ["127.0.0.1", "localhost"].includes(window.location.hostname);
const localBackend = backend === "http://127.0.0.1:57441" || backend === "http://localhost:57441";
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();

async function start() {
  if (!import.meta.env.DEV || !localPage || !localBackend
    || publicKey !== "local-synthetic-anon-key" || import.meta.env.VITE_DEMO_MODE === "true"
    || import.meta.env.VITE_RAZORPAY_TEST_ENABLED !== "true") {
    root.textContent = "Local TEST preview disabled. Use Vite development mode, a loopback page and the documented local synthetic backend configuration.";
    return;
  }
  const [{ MemoryRouter }, { AccountProvider, useAccount }, { RazorpayTestPage }, { supabase }] = await Promise.all([
    import("react-router-dom"), import("../src/context/AccountContext"),
    import("../src/pages/RazorpayTestPage"), import("../src/lib/supabase")
  ]);
  const client = supabase;
  if (!client) throw new Error("Local synthetic Supabase client unavailable.");

  function LocalLab() {
    const { account, signedIn, loading, error: accountError, refresh, signOut } = useAccount();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function login() {
      setBusy(true); setError("");
      try {
        const result = await client!.auth.signInWithPassword({ email: fixtureEmail, password: fixturePassword });
        if (result.error) throw new Error("Synthetic fixture sign-in failed. Check that the local TEST lab server is running.");
        await refresh();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Synthetic fixture sign-in failed.");
      } finally { setBusy(false); }
    }
    return <>
      <section className="section">
        <div className="wrap">
          <p className="eyebrow mono">Development only · Local TEST lab</p>
          <h1>Synthetic Admin authentication</h1>
          <p>This local preview uses synthetic authentication, actual local PostgreSQL TEST ledger functions and the actual Razorpay TEST provider. It does not use Supabase Auth or grant real bookings, services or paid access. Live payments remain disabled.</p>
          <p>Public local fixture: <code>{fixtureEmail}</code> / <code>{fixturePassword}</code>. Use only published Razorpay test details in checkout.</p>
          <div className="button-row">
            {!signedIn && <button className="button" disabled={busy || loading} onClick={() => void login()}>Sign in synthetic Admin</button>}
            {signedIn && <button className="button secondary" disabled={busy} onClick={() => void signOut()}>Sign out local fixture</button>}
          </div>
          {loading && <p role="status">Checking local fixture session…</p>}
          {account && <p role="status">Local fixture: {account.email} · {account.role.replaceAll("_", " ")}</p>}
          {(error || accountError) && <p role="alert">{error || accountError}</p>}
        </div>
      </section>
      {signedIn && <RazorpayTestPage />}
    </>;
  }
  createRoot(root).render(<MemoryRouter initialEntries={["/admin/payment-test"]}><AccountProvider client={client}><LocalLab /></AccountProvider></MemoryRouter>);
}

void start().catch(() => { root.textContent = "Local TEST preview could not start. Check the local development configuration and server."; });
