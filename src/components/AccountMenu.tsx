import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, membershipLabels, accountRoleLabels } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { AccountAvatar } from "./AccountAvatar";
import "./AccountMenu.css";
import { basicOnboardingAvailable } from "../config/release";

export function AccountMenu() {
  const { account, signedIn, loading, error, refresh, signOut } = useAccount();
  const menu = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { if (menu.current) menu.current.open = false; }, [pathname, signedIn]);
  if (loading && !signedIn) return <span className="account-loading" role="status">Loading account…</span>;
  if (!signedIn && !error) return <Link className="account-signin" to="/onboarding">Sign in</Link>;
  const role = account && accountRoleLabels[account.role];
  return <details className="account-menu" ref={menu} onKeyDown={(event) => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
    <summary>
      {account && supabase && <AccountAvatar client={supabase} userId={account.user_id} name={account.name || account.email} />}
      <span className="account-caption"><strong>{account?.name || "Your account"}</strong><span>{account ? membershipLabels[account.status] || "Status unavailable" : "Status unavailable"}</span>{role && <span className="account-role">{role}</span>}</span>
    </summary>
    <div className="account-panel">
      {error && <><p role="alert">{error}</p><button type="button" onClick={() => void refresh()}>Retry</button></>}
      <Link to="/onboarding">My registration</Link>
      <Link to="/booking-beta">Explore booking beta</Link>
      {account && ["admin", "super_admin", "membership_reviewer"].includes(account.role) && <Link to="/admin/members">{account.role === "membership_reviewer" ? "Membership reviews" : "Admin → Members"}</Link>}
      {account && ["admin", "super_admin"].includes(account.role) && <Link to="/admin/equipment-wishlist">Admin → Equipment wishlist</Link>}
      {basicOnboardingAvailable && account && ["admin", "super_admin"].includes(account.role) && <Link to="/admin/equipment">Admin → Equipment operations</Link>}
      {basicOnboardingAvailable && account && ["admin", "super_admin"].includes(account.role) && <Link to="/admin/discounts">Admin → Discounts</Link>}
      {account && ["admin", "super_admin"].includes(account.role) && <Link to="/admin/ecosystem">Admin → Ecosystem review</Link>}
      {signedIn && <button type="button" onClick={() => void signOut()}>Sign out</button>}
    </div>
  </details>;
}
