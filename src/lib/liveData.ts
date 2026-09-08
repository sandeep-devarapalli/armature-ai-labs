import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database";
import type {
  AttendanceSession,
  Booking,
  CalendarSync,
  DemoState,
  MemberProfile,
  MembershipApplication,
  PublicProfile,
  Resource,
  ResourceKind
} from "../types/domain";

type Client = SupabaseClient<Database>;
type PublicMemberRow =
  Database["public"]["Views"]["public_member_profiles"]["Row"];
type PublicResourceRow =
  Database["public"]["Views"]["public_resources"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type StaffRole = Database["public"]["Enums"]["staff_role"];

interface LiveSnapshot {
  state: DemoState;
  isStaff: boolean;
  isAdmin: boolean;
}

export function hasAdminRole(roles: Array<{ role: StaffRole }>) {
  return roles.some(({ role }) => role === "admin" || role === "super_admin");
}

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function record(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function links(value: Json | null): Array<{ label: string; url: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const candidate = item as Record<string, unknown>;
      const url = typeof candidate.url === "string" ? candidate.url : "";
      if (!url) return [];
      const label =
        typeof candidate.label === "string" && candidate.label
          ? candidate.label
          : url;
      return [{ label, url }];
    });
  }

  return Object.entries(record(value)).flatMap(([label, url]) =>
    typeof url === "string" && url ? [{ label, url }] : []
  );
}

function publicProfile(row: PublicMemberRow): MemberProfile | null {
  if (!row.id || !row.handle || !row.display_name) return null;
  return {
    id: row.id,
    handle: row.handle,
    name: row.display_name,
    avatarUrl: row.avatar_url ?? "",
    bio: row.bio ?? "",
    skills: row.skills ?? [],
    organization: row.organization ?? "",
    projectLinks: links(row.project_links),
    socialLinks: links(row.social_links),
    email: "",
    phone: "",
    emergencyContact: "",
    membershipState: "active",
    certifications: []
  };
}

function resourceKind(row: PublicResourceRow): ResourceKind {
  const slug = row.slug ?? "";
  if (row.kind === "compute") return "compute";
  if (row.kind === "mobile_robot" || /robot|arm|rover/.test(slug)) {
    return "robotics";
  }
  if (/drone|flight/.test(slug)) return "flight";
  if (/electronics|sensor|vision|camera/.test(slug)) return "electronics";
  if (
    row.kind === "equipment" ||
    /printer|laser|cnc|machine|fabrication/.test(slug)
  ) {
    return "fabrication";
  }
  return "workspace";
}

function fallbackImage(slug: string) {
  if (/drone/.test(slug)) return "/project-images/px4-x500-official.jpg";
  if (/robot|arm/.test(slug)) {
    return "/project-images/lerobot-so-arm-official.webp";
  }
  if (/gpu|compute|dgx|jetson/.test(slug)) {
    return "/project-images/autonomous-computer-official.webp";
  }
  return undefined;
}

function emergencyContact(value: Json | null) {
  const item = record(value);
  const parts = [item.summary, item.name, item.relationship, item.phone].filter(
    (part): part is string => typeof part === "string" && Boolean(part)
  );
  return parts.join(" · ");
}

function privateProfile(
  profile: ProfileRow,
  membership: MembershipRow | undefined,
  certificationNames: string[],
  email: string
): MemberProfile {
  return {
    id: profile.id,
    handle: profile.handle ?? "",
    name: profile.display_name || email.split("@")[0] || "Armature AI Labs member",
    avatarUrl: profile.avatar_url ?? "",
    bio: profile.bio,
    skills: profile.skills,
    organization: profile.organization ?? "",
    projectLinks: links(profile.project_links),
    socialLinks: links(profile.social_links),
    email,
    phone: profile.phone ?? "",
    emergencyContact: emergencyContact(profile.emergency_contact),
    membershipState: membership?.status ?? "pending",
    certifications: certificationNames
  };
}

function attendanceState(
  status: Database["public"]["Enums"]["attendance_status"]
): AttendanceSession["state"] {
  if (status === "active") return "open";
  if (status === "review") return "flagged";
  return "closed";
}

function syncState(
  status: Database["public"]["Enums"]["outbox_status"]
): CalendarSync["state"] {
  if (status === "succeeded") return "synced";
  if (status === "failed" || status === "dead_letter") return "failed";
  return "queued";
}

function certificationName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

export async function loadLiveSnapshot(
  client: Client,
  session: Session | null
): Promise<LiveSnapshot> {
  const [publicProfilesResult, resourcesResult, requirementsResult] =
    await Promise.all([
      client.from("public_member_profiles").select("*").order("display_name"),
      client.from("public_resources").select("*").order("name"),
      client.from("public_resource_certifications").select("*")
    ]);

  throwOnError(publicProfilesResult.error);
  throwOnError(resourcesResult.error);
  throwOnError(requirementsResult.error);

  const requirementMap = new Map<string, string[]>();
  for (const requirement of requirementsResult.data ?? []) {
    if (!requirement.resource_id || !requirement.name) continue;
    const current = requirementMap.get(requirement.resource_id) ?? [];
    current.push(requirement.name);
    requirementMap.set(requirement.resource_id, current);
  }

  const resources: Resource[] = (resourcesResult.data ?? []).flatMap((row) => {
    if (!row.id || !row.slug || !row.name) return [];
    return [
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        kind: resourceKind(row),
        zone: row.zone ?? row.location_name ?? "HSR Layout",
        description: row.description ?? "",
        capacity: row.capacity ?? 1,
        maxGuests: row.max_guests ?? 0,
        durationMinutes: row.default_duration_minutes ?? 60,
        maxDurationMinutes: row.max_duration_minutes ?? 240,
        bookingHorizonDays: row.booking_horizon_days ?? 30,
        certifications: requirementMap.get(row.id) ?? [],
        hazardous: row.risk === "hazardous",
        available: Boolean(row.reservable),
        image: row.image_url ?? fallbackImage(row.slug)
      }
    ];
  });

  const publicProfiles = (publicProfilesResult.data ?? [])
    .map(publicProfile)
    .filter((profile): profile is MemberProfile => Boolean(profile));

  if (!session) {
    return {
      isStaff: false,
      isAdmin: false,
      state: {
        currentUserId: null,
        profiles: publicProfiles,
        resources,
        bookings: [],
        attendance: [],
        checkinIntents: [],
        applications: [],
        calendarSync: []
      }
    };
  }

  const rolesResult = await client
    .from("staff_roles")
    .select("role")
    .eq("user_id", session.user.id);
  throwOnError(rolesResult.error);
  const roles = rolesResult.data ?? [];
  const isStaff = roles.length > 0;
  const isAdmin = hasAdminRole(roles);

  const [
    profilesResult,
    membershipsResult,
    certificationsResult,
    bookingsResult,
    guestsResult,
    attendanceResult,
    applicationsResult,
    outboxResult
  ] = await Promise.all([
    isStaff
      ? client.from("profiles").select("*").order("display_name")
      : client.from("profiles").select("*").eq("id", session.user.id),
    isStaff
      ? client.from("memberships").select("*")
      : client.from("memberships").select("*").eq("user_id", session.user.id),
    isStaff
      ? client
          .from("member_certifications")
          .select("member_id,status,expires_at,certification_types(name)")
      : client
          .from("member_certifications")
          .select("member_id,status,expires_at,certification_types(name)")
          .eq("member_id", session.user.id),
    client.from("bookings").select("*").order("starts_at"),
    client.from("booking_guests").select("*"),
    client.from("attendance_sessions").select("*").order("checked_in_at", {
      ascending: false
    }),
    client
      .from("membership_applications")
      .select("*")
      .order("submitted_at", { ascending: false }),
    isStaff
      ? client
          .from("integration_outbox")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null })
  ]);

  [
    profilesResult.error,
    membershipsResult.error,
    certificationsResult.error,
    bookingsResult.error,
    guestsResult.error,
    attendanceResult.error,
    applicationsResult.error,
    outboxResult.error
  ].forEach(throwOnError);

  const membershipByUser = new Map(
    (membershipsResult.data ?? []).map((membership) => [
      membership.user_id,
      membership
    ])
  );
  const certificationsByUser = new Map<string, string[]>();
  for (const certification of certificationsResult.data ?? []) {
    if (
      certification.status !== "active" ||
      (certification.expires_at &&
        new Date(certification.expires_at).getTime() <= Date.now())
    ) {
      continue;
    }
    const name = certificationName(certification.certification_types);
    if (!name) continue;
    const current = certificationsByUser.get(certification.member_id) ?? [];
    current.push(name);
    certificationsByUser.set(certification.member_id, current);
  }

  const profileById = new Map<string, MemberProfile>(
    publicProfiles.map((profile) => [profile.id, profile])
  );
  for (const profile of profilesResult.data ?? []) {
    profileById.set(
      profile.id,
      privateProfile(
        profile,
        membershipByUser.get(profile.id),
        certificationsByUser.get(profile.id) ?? [],
        profile.id === session.user.id ? session.user.email ?? "" : ""
      )
    );
  }

  const guestsByBooking = new Map<string, string[]>();
  for (const guest of guestsResult.data ?? []) {
    const current = guestsByBooking.get(guest.booking_id) ?? [];
    current.push(guest.name);
    guestsByBooking.set(guest.booking_id, current);
  }

  const bookings: Booking[] = (bookingsResult.data ?? []).map((booking) => ({
    id: booking.id,
    resourceId: booking.resource_id,
    ownerId: booking.member_id,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    purpose: booking.notes ?? "",
    guestNames: guestsByBooking.get(booking.id) ?? [],
    state:
      booking.status === "tentative" ? "confirmed" : booking.status,
    createdAt: booking.created_at
  }));

  const attendance: AttendanceSession[] = (attendanceResult.data ?? []).map(
    (sessionRow) => ({
      id: sessionRow.id,
      bookingId: sessionRow.booking_id ?? "",
      memberId: sessionRow.user_id,
      checkedInAt: sessionRow.checked_in_at,
      checkedOutAt: sessionRow.checked_out_at ?? undefined,
      state: attendanceState(sessionRow.status)
    })
  );

  const applications: MembershipApplication[] = (
    applicationsResult.data ?? []
  ).map((application) => ({
    id: application.id,
    memberId: application.user_id,
    buildSummary: application.applicant_notes ?? "",
    requestedAt: application.submitted_at,
    state:
      application.status === "rejected"
        ? "declined"
        : application.status === "withdrawn"
          ? "declined"
          : application.status
  }));

  const calendarSync: CalendarSync[] = (outboxResult.data ?? []).map(
    (outbox) => {
      const payload = record(outbox.payload);
      return {
        id: outbox.id,
        bookingId: outbox.aggregate_id,
        resourceId:
          typeof payload.resource_id === "string" ? payload.resource_id : "",
        operation: outbox.action === "remind" ? "update" : outbox.action,
        state: syncState(outbox.status),
        attempts: outbox.attempt_count,
        message:
          outbox.last_error ??
          (outbox.status === "succeeded"
            ? "Mirrored to the resource calendar"
            : "Waiting for the calendar worker")
      };
    }
  );

  return {
    isStaff,
    isAdmin,
    state: {
      currentUserId: session.user.id,
      profiles: Array.from(profileById.values()),
      resources,
      bookings,
      attendance,
      checkinIntents: [],
      applications,
      calendarSync
    }
  };
}

export function publicProfilesOnly(profiles: MemberProfile[]): PublicProfile[] {
  return profiles.filter((profile) => profile.membershipState === "active");
}
