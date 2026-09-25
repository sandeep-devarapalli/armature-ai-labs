import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, Field, Metric, PageHeader, Section, Status } from "../components/Primitives";
import { OperationsHeader } from "./AdminPages";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

type TeamAccess = {
  organization_id: string;
  organization_name: string;
  role: "admin" | "member";
  seat_enabled: boolean;
  membership_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};
type RosterMember = { user_id: string; display_name: string; role: "admin" | "member"; seat_enabled: boolean; joined_at: string };
type Invitation = { invitation_id: string; email: string; expires_at: string };
type Usage = { member_id: string; display_name: string; resource_name: string; starts_at: string; ends_at: string; usage_hours: number; attended_hours: number };
type Capacity = { seat_allowance: number; occupied_seats: number; pending_invitations: number };

const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : "—";

export function TeamWorkspacePage() {
  const { refresh: refreshMember } = useApp();
  const [access, setAccess] = useState<TeamAccess | null>(null);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setError("");
    const mine = await supabase.rpc("list_my_team_access");
    if (mine.error) { setError(mine.error.message); setLoading(false); return; }
    const first = (mine.data ?? [])[0] as TeamAccess | undefined;
    setAccess(first ?? null);
    if (first?.role === "admin") {
      const organizationId = first.organization_id;
      const [people, pending, activity, seats] = await Promise.all([
        supabase.rpc("list_team_roster", { p_organization_id: organizationId }),
        supabase.rpc("list_team_invitations", { p_organization_id: organizationId }),
        supabase.rpc("list_team_usage", { p_organization_id: organizationId }),
        supabase.rpc("get_team_capacity", { p_organization_id: organizationId })
      ]);
      const failure = people.error ?? pending.error ?? activity.error ?? seats.error;
      if (failure) setError(failure.message);
      else {
        setRoster((people.data ?? []) as RosterMember[]);
        setInvitations((pending.data ?? []) as Invitation[]);
        setUsage((activity.data ?? []) as Usage[]);
        setCapacity(((seats.data ?? [])[0] as Capacity | undefined) ?? null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !access) return;
    setWorking(true);
    setError("");
    setInviteLink("");
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email")).trim();
    const result = await supabase.rpc("team_create_invitation", { p_organization_id: access.organization_id, p_email: email });
    setWorking(false);
    if (result.error) { setError(result.error.message); return; }
    const token = (result.data as { token?: string } | null)?.token;
    if (token) setInviteLink(`${window.location.origin}/workspace/team/accept/${encodeURIComponent(token)}`);
    form.reset();
    await Promise.all([refresh(), refreshMember()]);
  }

  async function change(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setWorking(true);
    setError("");
    const result = await action();
    setWorking(false);
    if (result.error) setError(result.error.message);
    else await Promise.all([refresh(), refreshMember()]);
  }

  if (loading) return <div className="route-loading mono">Loading team workspace…</div>;
  const client = supabase;
  if (!client) return <PageHeader meta="Team membership" title="Team workspace" description="Team management requires the connected member service. The local demo does not create invitations or change team seats." />;
  if (!access) return <>
    <PageHeader meta="Team membership" title="Team workspace" description="A team appears here after staff activate its membership or you accept a team invitation." />
    <Section number="01" title="Get started"><EmptyState title="No team membership yet">Apply for a team membership or ask your team admin for an invitation link.</EmptyState><div className="section-actions"><Link className="button button-primary" to="/join?path=team">Apply for a team</Link></div>{error && <p className="form-error" role="alert">{error}</p>}</Section>
  </>;

  const isAdmin = access.role === "admin";
  return <>
    <PageHeader meta="Member workspace · team" title={access.organization_name} description={isAdmin ? "Manage named seats, invitations and team usage. Members make their own bookings." : "Your team membership and booking access."} actions={<Status tone={access.membership_active ? "good" : "warn"}>{access.membership_active ? "Active membership" : "Membership inactive"}</Status>} />
    <Section number="01" title="Membership">
      <div className="metric-grid three">
        <Metric label="Your role" value={isAdmin ? "Team admin" : "Member"} />
        <Metric label="Your seat" value={access.seat_enabled ? "Enabled" : "Not using a seat"} />
        <Metric label="Membership dates" value={`${date(access.starts_at)} – ${date(access.ends_at)}`} />
      </div>
      {isAdmin && capacity && <p className="lede">{capacity.occupied_seats} active seats and {capacity.pending_invitations} pending invitations of {capacity.seat_allowance} named seats.</p>}
      {!access.membership_active && <p className="lede">Staff activate and renew team membership after offline payment. Booking opens when membership is active.</p>}
      <div className="section-actions"><Link className="button button-quiet" to="/book">Book a resource</Link></div>
    </Section>
    {isAdmin && <>
      <Section number="02" title="People and seats">
        <p className="lede">Your admin account uses a seat only when you work in the lab. Removing a member ends future team access and cancels their future team bookings.</p>
        <div className="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Seat</th><th>Joined</th><th>Action</th></tr></thead><tbody>{roster.map((member) => <tr key={member.user_id}><td>{member.display_name}</td><td>{member.role}</td><td>{member.seat_enabled ? "Enabled" : "No seat"}</td><td>{date(member.joined_at)}</td><td>{member.role === "admin" ? <button type="button" className="button button-quiet" disabled={working} onClick={() => void change(() => client.rpc("team_set_admin_seat", { p_organization_id: access.organization_id, p_seat_enabled: !member.seat_enabled }))}>{member.seat_enabled ? "Release my seat" : "Use a seat"}</button> : <button type="button" className="button button-quiet" disabled={working} onClick={() => { if (window.confirm(`Remove ${member.display_name} from this team? Future team bookings will be cancelled.`)) void change(() => client.rpc("team_remove_member", { p_organization_id: access.organization_id, p_user_id: member.user_id })); }}>Remove</button>}</td></tr>)}</tbody></table></div>
      </Section>
      <Section number="03" title="Invite a builder">
        <p className="lede">Invitation links are bound to one email address, work once, and expire after seven days. Copy the link and share it with the intended person.</p>
        <form className="inline-form" onSubmit={(event) => void invite(event)}><Field label="Builder email"><input type="email" name="email" required autoComplete="email" /></Field><button className="button button-primary" type="submit" disabled={working || !access.membership_active}>Create invitation link</button></form>
        {inviteLink && <Field label="New invitation link" hint="Copy this now; the token is shown only when created."><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /></Field>}
        {invitations.length > 0 && <div className="table-wrap"><table><thead><tr><th>Invited email</th><th>Expires</th><th>Action</th></tr></thead><tbody>{invitations.map((item) => <tr key={item.invitation_id}><td>{item.email}</td><td>{date(item.expires_at)}</td><td><button className="button button-quiet" type="button" disabled={working} onClick={() => void change(() => client.rpc("team_revoke_invitation", { p_invitation_id: item.invitation_id }))}>Revoke</button></td></tr>)}</tbody></table></div>}
      </Section>
      <Section number="04" title="Team booking activity">
        <p className="lede">Booked hours include future reservations. Attended hours come from check-in records. Personal bookings and private booking notes are excluded.</p>
        {usage.length ? <div className="table-wrap"><table><thead><tr><th>Builder</th><th>Resource</th><th>Start</th><th>Booked hours</th><th>Attended hours</th></tr></thead><tbody>{usage.map((entry) => <tr key={`${entry.member_id}-${entry.resource_name}-${entry.starts_at}`}><td>{entry.display_name}</td><td>{entry.resource_name}</td><td>{date(entry.starts_at)}</td><td>{entry.usage_hours}</td><td>{entry.attended_hours}</td></tr>)}</tbody></table></div> : <EmptyState title="No team bookings yet">Team bookings will appear after members reserve resources.</EmptyState>}
      </Section>
    </>}
    {error && <Section number="05" title="Action needs attention"><p className="form-error" role="alert">{error}</p></Section>}
  </>;
}

export function AcceptTeamInvitationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useApp();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    if (!supabase || !token) return;
    setWorking(true);
    setError("");
    const result = await supabase.rpc("team_accept_invitation", { p_token: token });
    setWorking(false);
    if (result.error) setError(result.error.message);
    else {
      await refresh();
      navigate("/workspace/team", { replace: true });
    }
  }

  return <>
    <PageHeader meta="Team invitation" title="Join your team" description="This invitation is for your verified email address. Accepting it links your member account to the team." />
    <Section number="01" title="Accept invitation"><p className="lede">Add your display name in your <Link to="/profile">profile</Link> before accepting.</p><button className="button button-primary" type="button" disabled={working || !supabase || !token} onClick={() => void accept()}>{working ? "Joining…" : "Accept invitation"}</button>{error && <p className="form-error" role="alert">{error}</p>}</Section>
  </>;
}

type TeamApplication = { id: string; applicant_id: string; organization_name: string; contact_name: string; summary: string; requested_seats: number; status: string; created_at: string };
type Organization = { id: string; name: string };
type TeamMembership = { organization_id: string; status: "pending" | "active" | "suspended" | "expired" | "cancelled"; seat_allowance: number; starts_at: string | null; ends_at: string | null };
const labDate = (value: string, end = false) => value ? new Date(`${value}T${end ? "23:59:59" : "00:00:00"}+05:30`).toISOString() : null;
function dateInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function AdminTeamsPage() {
  const client = supabase;
  const { state } = useApp();
  const [applications, setApplications] = useState<TeamApplication[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [teamRoster, setTeamRoster] = useState<RosterMember[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!client) return;
    const [requests, teams, terms] = await Promise.all([
      client.from("team_membership_applications").select("id,applicant_id,organization_name,contact_name,summary,requested_seats,status,created_at").order("created_at", { ascending: false }),
      client.from("organizations").select("id,name").order("name"),
      client.from("organization_memberships").select("organization_id,status,seat_allowance,starts_at,ends_at")
    ]);
    const failure = requests.error ?? teams.error ?? terms.error;
    if (failure) setError(failure.message);
    else {
      setApplications((requests.data ?? []) as TeamApplication[]);
      setOrganizations((teams.data ?? []) as Organization[]);
      setMemberships((terms.data ?? []) as TeamMembership[]);
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!client || !selectedId) { setTeamRoster([]); return; }
    let active = true;
    void client.rpc("list_team_roster", { p_organization_id: selectedId }).then(({ data, error: readError }) => {
      if (!active) return;
      if (readError) setError(readError.message);
      else setTeamRoster((data ?? []) as RosterMember[]);
    });
    return () => { active = false; };
  }, [client, selectedId, organizations]);

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setWorking(true);
    setError("");
    setMessage("");
    const result = await action();
    setWorking(false);
    if (result.error) setError(result.error.message);
    else { setMessage(success); await refresh(); }
  }

  function decide(form: HTMLFormElement, applicationId: string, approve: boolean) {
    if (!client) return;
    const data = new FormData(form);
    const start = String(data.get("startsAt"));
    const end = String(data.get("endsAt"));
    if (start && end && end < start) {
      setError("End date must follow the start date.");
      return;
    }
    void run(() => client.rpc("staff_decide_team_application", {
      p_application_id: applicationId,
      p_approve: approve,
      p_notes: String(data.get("notes")).trim(),
      p_starts_at: approve ? labDate(start) : null,
      p_ends_at: approve ? labDate(end, true) : null
    }), approve ? "Request approved. Activate the pending team after offline payment." : "Application declined.");
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !selectedId) return;
    const data = new FormData(event.currentTarget);
    const start = String(data.get("startsAt"));
    const end = String(data.get("endsAt"));
    if (end && start && end < start) { setError("End date must follow the start date."); return; }
    const status = String(data.get("status")) as TeamMembership["status"];
    const activationOrRenewal = status === "active" && (selected?.status !== "active" || (end && end > dateInput(selected?.ends_at ?? null)));
    if (activationOrRenewal && data.get("paymentConfirmed") !== "on") { setError("Confirm offline payment before activation or renewal."); return; }
    void run(() => client.rpc("staff_set_team_membership", {
      p_organization_id: selectedId,
      p_status: status,
      p_seat_allowance: Number(data.get("seats")),
      p_starts_at: labDate(start),
      p_ends_at: labDate(end, true)
    }), "Team membership updated.");
  }

  const selected = memberships.find((item) => item.organization_id === selectedId);
  const selectedName = organizations.find((item) => item.id === selectedId)?.name;
  if (!client) return <PageHeader meta="Staff operations · team membership" title="Team memberships" description="Team review and activation require the connected member service. The local demo does not change organization records." />;
  return <>
    <OperationsHeader>Team memberships</OperationsHeader>
    <Section number="01" title="Team applications">
      <p className="lede">Approve the request to create a pending team. Activate its seats after offline payment is confirmed.</p>
      {applications.filter((item) => item.status === "pending").length === 0 && <EmptyState title="No pending applications">New team requests will appear here for staff review.</EmptyState>}
      {applications.filter((item) => item.status === "pending").map((item) => <form key={item.id} className="inline-form" onSubmit={(event) => { event.preventDefault(); decide(event.currentTarget, item.id, true); }}>
        <h3>{item.organization_name}</h3><p>{item.contact_name} · {item.requested_seats} named seats · requested {date(item.created_at)}</p><p>{item.summary}</p>
        <div className="form-grid"><Field label="Start date"><input name="startsAt" type="date" /></Field><Field label="Last active date"><input name="endsAt" type="date" /></Field><Field label="Decision notes"><input name="notes" maxLength={500} /></Field></div>
        <div className="button-row"><button className="button button-primary" type="submit" disabled={working}>Approve request</button><button className="button button-quiet" type="button" disabled={working} onClick={(event) => { if (event.currentTarget.form) decide(event.currentTarget.form, item.id, false); }}>Decline</button></div>
      </form>)}
    </Section>
    <Section number="02" title="Active and past teams">
      <Field label="Select a team"><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Select a team</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></Field>
      {selected && <>
        <form className="inline-form" key={selectedId} onSubmit={update}>
          <h3>{selectedName}</h3>
          <div className="form-grid"><Field label="Status"><select name="status" defaultValue={selected.status}><option value="active">Active</option><option value="suspended">Suspended</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></Field><Field label="Named seats"><input name="seats" type="number" min={1} max={10000} required defaultValue={selected.seat_allowance} /></Field><Field label="Start date"><input name="startsAt" type="date" defaultValue={dateInput(selected.starts_at)} /></Field><Field label="Last active date"><input name="endsAt" type="date" defaultValue={dateInput(selected.ends_at)} /></Field></div>
          <label className="team-check"><input name="paymentConfirmed" type="checkbox" /> Offline payment confirmed for activation or renewal</label>
          <button className="button button-primary" type="submit" disabled={working}>Save membership</button>
        </form>
        <div className="inline-form"><h3>Transfer team admin</h3><p>Select an active team member. Staff retain oversight after transfer.</p><div className="button-row">{teamRoster.filter((person) => person.role === "member").map((person) => <button key={person.user_id} className="button button-quiet" type="button" disabled={working} onClick={() => { if (client && window.confirm(`Make ${person.display_name} the team admin?`)) void run(() => client.rpc("staff_transfer_team_admin", { p_organization_id: selectedId, p_new_admin_user_id: person.user_id }), "Team admin transferred."); }}>{person.display_name}</button>)}</div></div>
      </>}
    </Section>
    <Section number="03" title="Create a team directly"><p className="lede">Use this for a verified admin who arranged membership with staff outside the application form.</p>
      <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (!client) return; const data = new FormData(event.currentTarget); const start = String(data.get("startsAt")); const end = String(data.get("endsAt")); if (!start || !end || end < start || data.get("paymentConfirmed") !== "on") { setError("Confirm offline payment and enter valid membership dates."); return; } void run(() => client.rpc("staff_create_team", { p_organization_name: String(data.get("organizationName")).trim(), p_admin_user_id: String(data.get("adminId")), p_seat_allowance: Number(data.get("seats")), p_starts_at: labDate(start), p_ends_at: labDate(end, true) }), "Team created and activated."); }}>
        <div className="form-grid"><Field label="Admin account" hint="The selected account must have a verified email."><select name="adminId" required defaultValue=""><option value="" disabled>Select member account</option>{state.profiles.map((person) => <option key={person.id} value={person.id}>{person.name || person.handle}</option>)}</select></Field><Field label="Organization name"><input name="organizationName" required maxLength={160} /></Field><Field label="Named seats"><input name="seats" type="number" min={1} max={10000} required defaultValue={2} /></Field><Field label="Start date"><input name="startsAt" type="date" required /></Field><Field label="Last active date"><input name="endsAt" type="date" required /></Field></div><label className="team-check"><input name="paymentConfirmed" type="checkbox" /> Offline payment confirmed</label><button className="button button-primary" type="submit" disabled={working}>Create and activate team</button>
      </form>
    </Section>
    {error && <p className="form-error wrap" role="alert">{error}</p>}{message && <p className="success-message wrap" role="status">{message}</p>}
  </>;
}
