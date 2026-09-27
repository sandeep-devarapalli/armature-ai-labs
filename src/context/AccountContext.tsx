import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface AccountSummary {
  user_id: string; name: string; email: string; status: string;
  application_status: string | null; role: "member" | "membership_reviewer" | "admin" | "super_admin";
  revision: number | null; owner_approval_available: boolean;
}
export const membershipLabels: Record<string, string> = {
  incomplete: "Registration incomplete", pending: "Pending review", corrections_requested: "Action required",
  approved: "Basic · Approved", rejected: "Registration rejected", revoked: "Basic · Revoked",
};
export const accountRoleLabels: Record<string, string> = {
  membership_reviewer: "Staff", admin: "Admin", super_admin: "Super admin",
};
interface AccountState {
  account: AccountSummary | null; signedIn: boolean; loading: boolean; error: string;
  refresh: () => Promise<void>; signOut: () => Promise<void>;
}
const AccountContext = createContext<AccountState>({ account: null, signedIn: false, loading: false, error: "", refresh: async () => {}, signOut: async () => {} });

export function AccountProvider({ children, client = supabase }: PropsWithChildren<{ client?: SupabaseClient | null }>) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const identity = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!client) { setLoading(false); return; }
    try {
      const { data, error: sessionError } = await client.auth.getSession();
      if (request !== generation.current) return;
      if (sessionError) throw sessionError;
      const user = data.session?.user;
      if (identity.current !== (user?.id ?? null)) { setAccount(null); setLoading(true); }
      identity.current = user?.id ?? null;
      setSignedIn(Boolean(user));
      if (!user) { setAccount(null); setError(""); return; }
      const result = await client.rpc("get_basic_account_summary");
      if (request !== generation.current) return;
      if (result.error) throw result.error;
      const summary = result.data as AccountSummary | null;
      if (!summary || summary.user_id !== user.id) throw new Error("Account status is unavailable.");
      setAccount(summary); setError("");
    } catch {
      if (request === generation.current) { setAccount(null); setError("Unable to refresh account status. Please retry."); }
    } finally { if (request === generation.current) setLoading(false); }
  }, [client]);
  const signOut = useCallback(async () => {
    if (!client) return;
    const result = await client.auth.signOut();
    if (result.error) { setError("Sign out failed. Please retry."); return; }
    ++generation.current; identity.current = null;
    setAccount(null); setSignedIn(false); setLoading(false); setError("");
    window.dispatchEvent(new Event("armature:account-changed"));
  }, [client]);
  useEffect(() => {
    let active = true;
    void refresh();
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      ++generation.current;
      if (identity.current !== (session?.user.id ?? null)) { setAccount(null); setLoading(true); }
      setTimeout(() => { if (active) void refresh(); }, 0);
    });
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("armature-account-status");
    const update = () => { void refresh(); channel?.postMessage("refresh"); };
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    if (channel) channel.onmessage = () => void refresh();
    window.addEventListener("armature:account-changed", update);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const interval = window.setInterval(focus, 60000);
    return () => {
      active = false; ++generation.current;
      subscription?.data.subscription.unsubscribe(); channel?.close();
      window.removeEventListener("armature:account-changed", update); window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus); window.clearInterval(interval);
    };
  }, [client, refresh]);
  return <AccountContext.Provider value={{ account, signedIn, loading, error, refresh, signOut }}>{children}</AccountContext.Provider>;
}
export const useAccount = () => useContext(AccountContext);
export function useRegistrationLabel(signedOutLabel = "Register for free") {
  const { account, signedIn, loading } = useAccount();
  if (loading) return "My registration";
  if (!signedIn) return signedOutLabel;
  return !account || ["incomplete", "corrections_requested"].includes(account.status) ? "Complete registration" : "View membership";
}
