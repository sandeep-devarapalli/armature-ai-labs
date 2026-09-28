import { useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { requestOnboardingDocument } from "../lib/onboarding";
import { MemberNotificationStatus } from "../components/MemberNotificationStatus";
import { AccountAvatar } from "../components/AccountAvatar";
import { OnboardingForm } from "./OnboardingForm";
import "./MemberManagementPage.css";

type Role = "member" | "membership_reviewer" | "admin" | "super_admin";
interface MemberRow { user_id: string; name: string; email: string; registered_at: string; status: string; application_status: string | null; role: Role; revision: number | null; photo_available: boolean; id_available: boolean; reviewed_at: string | null }
interface MemberList { items: MemberRow[]; total: number; counts: Record<string, number> }
export const memberStatusLabels: Record<string, string> = { incomplete: "Registration incomplete", pending: "Pending review", corrections_requested: "Action required", approved: "Basic · Approved", rejected: "Registration rejected", revoked: "Basic · Revoked" };
const roleLabels: Record<Role, string> = { member: "Member", membership_reviewer: "Staff", admin: "Admin", super_admin: "Super admin" };
const empty: MemberList = { items: [], total: 0, counts: {} };
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";
export function canManageMemberRole(actor: Role, target: Role, own: boolean) {
  return !own && target !== "super_admin" && (actor === "super_admin" || (actor === "admin" && ["member", "membership_reviewer"].includes(target)));
}
export function MemberManagementPage({ client = supabase as SupabaseClient | null }: { client?: SupabaseClient | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>("member");
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<MemberList>(empty);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<MemberRow | null>(null);
  const [viewRequest, setViewRequest] = useState(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!viewRequest) return;
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView?.({ behavior: "instant", block: "center" });
  }, [viewRequest]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<"revoke" | "reinstate" | "role" | null>(null);
  const [targetRole, setTargetRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const admin = role === "admin" || role === "super_admin";
  useEffect(() => {
    if (!client) { setLoading(false); return; }
    let active = true;
    const adopt = (value: Session | null) => { if (!active) return; generation.current++; setSession(value); setRole("member"); setList(empty); setSelected(null); setAction(null); setError(""); setNotice(""); setBusy(false); setLoading(Boolean(value)); };
    const initialGeneration = generation.current;
    void client.auth.getSession().then(({ data, error: failure }) => { if (!active || generation.current !== initialGeneration) return; if (failure) setError(failure.message); adopt(data.session); });
    const { data } = client.auth.onAuthStateChange((_event, value) => { window.setTimeout(() => adopt(value), 0); });
    return () => { active = false; generation.current++; data.subscription.unsubscribe(); };
  }, [client]);
  useEffect(() => {
    const reload = () => { setRefresh((value) => value + 1); };
    window.addEventListener("focus", reload); window.addEventListener("armature:account-changed", reload);
    return () => { window.removeEventListener("focus", reload); window.removeEventListener("armature:account-changed", reload); };
  }, []);
  useEffect(() => {
    if (!client || !session) return;
    const request = ++generation.current;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => { void (async () => {
      const summary = await client.rpc("get_basic_account_summary");
      if (summary.error) throw summary.error;
      if (request !== generation.current) return;
      const nextRole = summary.data.role as Role; setRole(nextRole);
      if (nextRole === "member") { setList(empty); setSelected(null); setAction(null); return; }
      const response = await client.rpc("list_basic_members", { p_search: search.trim(), p_status: nextRole === "membership_reviewer" ? "pending" : status || null, p_role: nextRole === "membership_reviewer" ? null : roleFilter || null, p_page: page, p_page_size: 25 });
      if (response.error) throw response.error;
      if (request !== generation.current) return;
      setList(response.data as MemberList);
      setSelected((previous) => previous ? response.data.items.find((row: MemberRow) => row.user_id === previous.user_id) || null : null);
    })().catch((failure) => { if (request === generation.current) { setError(failure.message || "Could not load members."); setList(empty); setSelected(null); setAction(null); } }).finally(() => { if (request === generation.current) setLoading(false); }); }, 200);
    return () => { window.clearTimeout(timer); generation.current++; };
  }, [client, session, search, status, roleFilter, page, refresh]);
  async function perform(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || !selected || !action) return;
    const request = generation.current;
    const fields = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      const response = action === "role" ? await client.rpc("set_membership_staff_role", { p_user_id: selected.user_id, p_role: targetRole, p_expected_role: selected.role }) : await client.rpc("change_basic_membership", { p_user_id: selected.user_id, p_action: action, p_reason: fields.get("reason"), p_expected_revision: selected.revision });
      if (response.error) throw response.error;
      if (request !== generation.current) return;
      setAction(null); setSelected(null); setNotice("Change recorded. Paid access is unchanged."); window.dispatchEvent(new Event("armature:account-changed"));
    } catch (failure) { if (request === generation.current) setError((failure as Error).message); } finally { setBusy(false); }
  }
  const requestDocument = (id: string, file?: File) => requestOnboardingDocument(client!, import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY, id, file);
  return <div className="member-management"><header className="page-hero"><div className="wrap"><p className="eyebrow">Protected member area</p><h1>{role === "membership_reviewer" ? "Membership reviews" : "Members"}</h1><p className="lede">{role === "membership_reviewer" ? "Review pending applications and approve eligible basic memberships." : "Manage registrations, membership decisions and staff access."}</p></div></header><section className="section"><div className="wrap">
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!session && !loading ? <Link className="button" to="/auth" state={{ from: "/admin/members" }}>Sign in</Link> : role === "member" && !loading ? <p>You do not have permission to review members.</p> : <>
      <div className="member-filters"><label>Search members<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelected(null); }} placeholder="Name or email" /></label>{admin && <><label>Membership status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setSelected(null); }}><option value="">All statuses</option>{Object.entries(memberStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Role<select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); setSelected(null); }}><option value="">All roles</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></>}<button className="button secondary" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh list</button></div>
      <div className="member-counts" aria-label="Membership totals">{Object.entries(list.counts).map(([key, count]) => <span key={key}>{memberStatusLabels[key] || key}: <strong>{count}</strong></span>)}</div>
      {loading && <p role="status">Loading members…</p>}
      <div className="member-table-scroll"><table><caption>{list.total} matching registrations</caption><thead><tr><th>Member</th><th>Status / role</th><th>Documents</th><th>Registered / reviewed</th><th>Details</th></tr></thead><tbody>{list.items.map((member) => <tr key={member.user_id}><td><AccountAvatar client={client!} userId={member.user_id} name={member.name || member.email} /><strong>{member.name || "Registration incomplete"}</strong><br />{member.email}</td><td data-label="Status / role">{memberStatusLabels[member.status] || member.status}<br />{roleLabels[member.role]}</td><td data-label="Documents">Photo: {member.photo_available ? "available" : "missing / expired"}<br />ID: {member.id_available ? "available" : "missing / expired"}</td><td data-label="Registered / reviewed">{date(member.registered_at)}<br />{date(member.reviewed_at)}</td><td><button className="button secondary" aria-controls="selected-member" aria-expanded={selected?.user_id === member.user_id} onClick={() => { setSelected(member); setViewRequest(value => value + 1); setAction(null); setNotice(""); }}>View <span className="sr-only">{member.name || member.email}</span></button></td></tr>)}</tbody></table></div>
      {!loading && list.items.length === 0 && <p>No matching applications.</p>}
      <div className="member-pagination"><button className="button secondary" disabled={loading || page === 1} onClick={() => { setPage(page - 1); setSelected(null); }}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(list.total / 25))}</span><button className="button secondary" disabled={loading || page * 25 >= list.total} onClick={() => { setPage(page + 1); setSelected(null); }}>Next</button></div>
      {admin && session && !loading && <MemberNotificationStatus key={session.user.id} client={client!} />}
      {selected && <section id="selected-member" className="member-detail" aria-label="Selected member"><h2 ref={detailHeading} tabIndex={-1}>{selected.name || selected.email}</h2><button className="button secondary" onClick={() => { setSelected(null); setAction(null); }}>Close details</button>
        {admin && <div className="member-actions">{selected.user_id !== session?.user.id && selected.application_status === "approved" && <button className="button secondary" onClick={() => setAction("revoke")}>Revoke membership</button>}{selected.user_id !== session?.user.id && selected.application_status === "revoked" && <button className="button secondary" onClick={() => setAction("reinstate")}>Reinstate membership</button>}{canManageMemberRole(role, selected.role, selected.user_id === session?.user.id) && <button className="button secondary" onClick={() => { setTargetRole(selected.role); setAction("role"); }}>Manage staff role</button>}</div>}
        {action && <form className="ol-form member-confirm" onSubmit={perform}><h3>{action === "role" ? "Confirm staff access change" : `Confirm ${action === "revoke" ? "membership revocation" : "membership reinstatement"}`}</h3><p>Account: <strong>{selected.email}</strong></p>{action === "role" ? <><label>New role<select value={targetRole} onChange={(event) => setTargetRole(event.target.value as Role)}><option value="member">Member — remove staff access</option><option value="membership_reviewer">Staff — pending application review and approval</option>{role === "super_admin" && <option value="admin">Admin — membership and Staff management</option>}</select></label><p>{targetRole === "admin" ? "Admin access permits membership decisions and Staff management, but not Admin appointments." : targetRole === "membership_reviewer" ? "Staff can inspect pending applications and approve membership only." : "All staff privileges will be removed. Personal membership remains unchanged."}</p></> : <><label>Reason<textarea name="reason" required minLength={10} maxLength={1000} rows={3} /></label><p>Staff access is separate and will not change. {action === "revoke" ? "The member retains sign-in and their own status page, but loses community privileges." : "Previously approved basic membership will be restored."}</p></>}<label><input type="checkbox" required /> I confirm this change for the account above.</label><div className="member-actions"><button className="button" disabled={busy || (action === "role" && targetRole === selected.role)}>Confirm change</button><button type="button" className="button secondary" onClick={() => setAction(null)}>Cancel</button></div></form>}
        {selected.application_status ? <OnboardingForm key={`${selected.user_id}:${selected.revision}`} client={client} requestDocument={requestDocument} initialUserId={selected.user_id} /> : <p>This account has not submitted an application yet.</p>}
      </section>}
    </>}
  </div></section></div>;
}
