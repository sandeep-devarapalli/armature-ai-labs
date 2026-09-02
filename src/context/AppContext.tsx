import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import type { Session } from "@supabase/supabase-js";
import { addMinutes, isAfter, isBefore, parseISO } from "date-fns";
import { initialDemoState } from "../data/demo";
import { hasOpenDemoLoans } from "../data/inventoryDemo";
import { hasOpenDemoToolkitRental } from "../data/makerServices";
import { safeAuthReturnPath } from "../lib/authReturnPath";
import { loadLiveSnapshot } from "../lib/liveData";
import { membershipApplicationConflictMessage } from "../lib/membershipApplicationError";
import { dataMode, googleAuthEnabled, supabase } from "../lib/supabase";
import type {
  AvailabilitySlot,
  Booking,
  CheckinAction,
  CheckinIntent,
  DemoState,
  MemberProfile,
  Resource
} from "../types/domain";

const STORAGE_KEY = "armature-demo-state-v1";

interface BookingInput {
  resourceId: string;
  startsAt: string;
  durationMinutes: number;
  purpose: string;
  guestNames: string[];
}

interface MembershipApplicationInput {
  name: string;
  handle: string;
  summary: string;
}

interface ResourceBlockInput {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  kind: "maintenance" | "closure" | "staff_hold";
  reason: string;
}

interface ResourceHoursInput {
  resourceId: string;
  dayOfWeek: number;
  opensAt?: string;
  closesAt?: string;
}

interface KioskEnrollment {
  token: string;
  expiresAt: string;
}

interface AppContextValue {
  state: DemoState;
  currentMember: MemberProfile | null;
  mode: typeof dataMode;
  online: boolean;
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  notice: string;
  clearNotice: () => void;
  refresh: () => Promise<void>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
  requestOtp: (email: string, returnTo?: string) => Promise<void>;
  signInGoogle: (returnTo?: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  updateProfile: (updates: Partial<MemberProfile>) => Promise<void>;
  submitApplication: (input: MembershipApplicationInput) => Promise<void>;
  listAvailability: (
    resourceId: string,
    from: string,
    to: string,
    durationMinutes: number
  ) => Promise<AvailabilitySlot[]>;
  createBooking: (input: BookingInput) => Promise<Booking>;
  cancelBooking: (id: string) => Promise<void>;
  rescheduleBooking: (
    id: string,
    startsAt: string,
    durationMinutes: number
  ) => Promise<void>;
  decideMembership: (
    applicationId: string,
    approved: boolean
  ) => Promise<void>;
  issueCertification: (
    memberId: string,
    certificationName: string,
    expiresAt: string,
    notes: string
  ) => Promise<void>;
  setBookingStatus: (
    bookingId: string,
    status: "cancelled" | "no_show" | "completed",
    reason: string
  ) => Promise<void>;
  toggleResource: (resourceId: string) => Promise<void>;
  createResourceBlock: (input: ResourceBlockInput) => Promise<void>;
  setResourceHours: (input: ResourceHoursInput) => Promise<void>;
  createKioskEnrollment: (name: string) => Promise<KioskEnrollment>;
  createCheckinIntent: (
    bookingId?: string,
    action?: CheckinAction
  ) => Promise<CheckinIntent>;
  redeemCheckinIntent: (token: string) => Promise<string>;
  checkOut: (attendanceId: string) => Promise<void>;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const emptyLiveState: DemoState = {
  currentUserId: null,
  profiles: [],
  resources: [],
  bookings: [],
  attendance: [],
  checkinIntents: [],
  applications: [],
  calendarSync: []
};

function readState(): DemoState {
  if (typeof window === "undefined" || dataMode === "supabase") {
    return emptyLiveState;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as DemoState) : initialDemoState;
  } catch {
    return initialDemoState;
  }
}

function randomId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function linksObject(links: MemberProfile["socialLinks"]) {
  return Object.fromEntries(links.map((link) => [link.label, link.url]));
}

function authCallbackUrl(returnTo = "/dashboard") {
  const callback = new URL("/auth/callback", window.location.origin);
  callback.searchParams.set("next", safeAuthReturnPath(returnTo));
  return callback.toString();
}

function validateDemoBooking(
  state: DemoState,
  member: MemberProfile,
  resource: Resource,
  input: BookingInput
) {
  if (member.membershipState !== "active") {
    throw new Error("An active membership is required to book.");
  }
  if (!resource.available) throw new Error("This resource is not available.");
  const missing = resource.certifications.filter(
    (certification) => !member.certifications.includes(certification)
  );
  if (missing.length) {
    throw new Error(`Certification required: ${missing.join(", ")}`);
  }
  if (input.guestNames.length > resource.maxGuests) {
    throw new Error(`This resource permits ${resource.maxGuests} guest(s).`);
  }
  const starts = parseISO(input.startsAt);
  const ends = addMinutes(starts, input.durationMinutes);
  if (input.durationMinutes < 15 || input.durationMinutes % 15 !== 0) {
    throw new Error("Bookings use 15-minute increments.");
  }
  if (input.durationMinutes > resource.maxDurationMinutes) {
    throw new Error(
      `Maximum duration is ${resource.maxDurationMinutes} minutes.`
    );
  }
  const conflict = state.bookings.some((booking) => {
    if (
      booking.resourceId !== resource.id ||
      booking.state !== "confirmed"
    ) {
      return false;
    }
    const existingStart = parseISO(booking.startsAt);
    const existingEnd = parseISO(booking.endsAt);
    return isBefore(starts, existingEnd) && isAfter(ends, existingStart);
  });
  if (conflict) throw new Error("That time overlaps an existing reservation.");
  return { starts, ends };
}

export function AppProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<DemoState>(readState);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loading, setLoading] = useState(dataMode === "supabase");
  const [isStaff, setIsStaff] = useState(
    () => dataMode === "demo" && Boolean(readState().currentUserId)
  );
  const [isAdmin, setIsAdmin] = useState(
    () => dataMode === "demo" && Boolean(readState().currentUserId)
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (dataMode === "demo") {
      setIsStaff(Boolean(state.currentUserId));
      setIsAdmin(Boolean(state.currentUserId));
    }
  }, [state.currentUserId]);

  useEffect(() => {
    if (dataMode === "demo") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const hydrate = useCallback(async (session: Session | null) => {
    if (!supabase) return;
    setIsStaff(false);
    setIsAdmin(false);
    setLoading(true);
    try {
      const snapshot = await loadLiveSnapshot(supabase, session);
      setState(snapshot.state);
      setIsStaff(snapshot.isStaff);
      setIsAdmin(snapshot.isAdmin);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load live data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await hydrate(data.session);
  }, [hydrate]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setNotice(error.message);
        setLoading(false);
        return;
      }
      void hydrate(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (active) void hydrate(session);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [hydrate]);

  const currentMember =
    state.profiles.find((profile) => profile.id === state.currentUserId) ?? null;

  const signInDemo = useCallback(() => {
    if (dataMode !== "demo") return;
    setState((value) => ({ ...value, currentUserId: "member-demo" }));
    setIsStaff(true);
    setIsAdmin(true);
    setNotice("Demo member session started.");
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await hydrate(null);
    } else {
      setState((value) => ({ ...value, currentUserId: null }));
      setIsStaff(false);
      setIsAdmin(false);
    }
    setNotice("Signed out.");
  }, [hydrate]);

  const requestOtp = useCallback(
    async (email: string, returnTo?: string) => {
      if (supabase) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: authCallbackUrl(returnTo),
            shouldCreateUser: true
          }
        });
        if (error) throw error;
        setNotice("Check your email for the secure sign-in link.");
        return;
      }
      signInDemo();
      setNotice(
        `Demo mode: signed in locally as Anika. No email was sent to ${email}.`
      );
    },
    [signInDemo]
  );

  const signInGoogle = useCallback(async (returnTo?: string) => {
    if (supabase) {
      if (!googleAuthEnabled) {
        throw new Error(
          "Google sign-in will be available after the Workspace OAuth client is connected. Use the secure email link for now."
        );
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authCallbackUrl(returnTo) }
      });
      if (error) throw error;
      return;
    }
    signInDemo();
    setNotice("Demo mode: Google OAuth is simulated locally.");
  }, [signInDemo]);

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!state.currentUserId) throw new Error("Sign in to upload an avatar.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Use a JPEG, PNG, or WebP image.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Avatar images must be 5 MB or smaller.");
      }
      if (!supabase) {
        const avatarUrl = URL.createObjectURL(file);
        setState((value) => ({
          ...value,
          profiles: value.profiles.map((profile) =>
            profile.id === value.currentUserId
              ? { ...profile, avatarUrl }
              : profile
          )
        }));
        setNotice("Avatar preview saved for this demo session.");
        return;
      }
      const path = `${state.currentUserId}/avatar`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: true
        });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", state.currentUserId);
      if (profileError) throw profileError;
      await refresh();
      setNotice("Avatar uploaded.");
    },
    [refresh, state.currentUserId]
  );

  const updateProfile = useCallback(
    async (updates: Partial<MemberProfile>) => {
      if (!state.currentUserId) throw new Error("Sign in to edit your profile.");
      if (supabase) {
        const payload = {
          display_name: updates.name,
          handle: updates.handle?.toLowerCase(),
          organization: updates.organization || null,
          bio: updates.bio,
          phone: updates.phone || null,
          emergency_contact: updates.emergencyContact
            ? { summary: updates.emergencyContact }
            : null,
          skills: updates.skills,
          project_links: updates.projectLinks,
          social_links: updates.socialLinks
        };
        const { error } = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", state.currentUserId);
        if (error) throw error;
        await refresh();
        setNotice("Profile saved.");
        return;
      }
      setState((value) => ({
        ...value,
        profiles: value.profiles.map((profile) =>
          profile.id === value.currentUserId
            ? { ...profile, ...updates }
            : profile
        )
      }));
      setNotice("Profile saved locally.");
    },
    [refresh, state.currentUserId]
  );

  const submitApplication = useCallback(
    async ({ name, handle, summary }: MembershipApplicationInput) => {
      if (!currentMember) throw new Error("Sign in before applying.");
      const displayName = name.trim();
      const profileHandle = handle.trim().toLowerCase();
      const buildSummary = summary.trim();
      if (displayName.length < 2) throw new Error("Enter your full name.");
      if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(profileHandle)) {
        throw new Error("Use 3–30 lowercase letters, numbers, underscores, or hyphens for your handle.");
      }
      if (!buildSummary) throw new Error("Tell us what you are building.");
      if (state.applications.some(
        (application) => application.memberId === currentMember.id && application.state === "pending"
      )) {
        throw new Error("Your membership application is already under review.");
      }
      if (supabase) {
        const { error } = await supabase.rpc("submit_application", {
          p_display_name: displayName,
          p_handle: profileHandle,
          p_bio: currentMember.bio,
          p_phone: currentMember.phone || undefined,
          p_emergency_contact: currentMember.emergencyContact
            ? { summary: currentMember.emergencyContact }
            : undefined,
          p_organization: currentMember.organization || undefined,
          p_skills: currentMember.skills,
          p_project_links: currentMember.projectLinks,
          p_social_links: linksObject(currentMember.socialLinks),
          p_applicant_notes: buildSummary
        });
        const conflictMessage = error && membershipApplicationConflictMessage(error);
        if (conflictMessage) throw new Error(conflictMessage);
        if (error) throw error;
        await refresh();
        setNotice("Membership application submitted for staff review.");
        return;
      }
      setState((value) => {
        const existing = value.applications.find(
          (application) => application.memberId === value.currentUserId
        );
        const profiles = value.profiles.map((profile) =>
          profile.id === value.currentUserId
            ? { ...profile, name: displayName, handle: profileHandle }
            : profile
        );
        if (existing) {
          return {
            ...value,
            profiles,
            applications: value.applications.map((application) =>
              application.id === existing.id
                ? {
                    ...application,
                    buildSummary,
                    state: "pending"
                  }
                : application
            )
          };
        }
        return {
          ...value,
          profiles,
          applications: [
            ...value.applications,
            {
              id: randomId("application"),
              memberId: value.currentUserId ?? "",
              buildSummary,
              requestedAt: new Date().toISOString(),
              state: "pending"
            }
          ]
        };
      });
      setNotice("Membership application submitted for staff review.");
    },
    [currentMember, refresh, state.applications]
  );

  const listAvailability = useCallback(
    async (
      resourceId: string,
      from: string,
      to: string,
      durationMinutes: number
    ) => {
      if (supabase) {
        const { data, error } = await supabase.rpc("list_availability", {
          p_resource_id: resourceId,
          p_from: from,
          p_to: to,
          p_duration_minutes: durationMinutes
        });
        if (error) throw error;
        return (data ?? []).map((slot) => ({
          startsAt: slot.starts_at,
          endsAt: slot.ends_at,
          available: slot.available,
          reason: slot.reason
        }));
      }
      const resource = state.resources.find((item) => item.id === resourceId);
      if (!resource) return [];
      const slots: AvailabilitySlot[] = [];
      let cursor = parseISO(from);
      const limit = parseISO(to);
      while (isBefore(cursor, limit)) {
        const end = addMinutes(cursor, durationMinutes);
        const reserved = state.bookings.some(
          (booking) =>
            booking.resourceId === resourceId &&
            booking.state === "confirmed" &&
            isBefore(cursor, parseISO(booking.endsAt)) &&
            isAfter(end, parseISO(booking.startsAt))
        );
        slots.push({
          startsAt: cursor.toISOString(),
          endsAt: end.toISOString(),
          available: !reserved,
          reason: reserved ? "reserved" : null
        });
        cursor = addMinutes(cursor, 15);
      }
      return slots;
    },
    [state.bookings, state.resources]
  );

  const createBooking = useCallback(
    async (input: BookingInput) => {
      const member = state.profiles.find(
        (profile) => profile.id === state.currentUserId
      );
      const resource = state.resources.find(
        (item) => item.id === input.resourceId
      );
      if (!member || !resource) throw new Error("Booking context is missing.");
      const starts = parseISO(input.startsAt);
      const ends = addMinutes(starts, input.durationMinutes);

      if (supabase) {
        const { data, error } = await supabase.rpc("create_booking", {
          p_resource_id: resource.id,
          p_starts_at: starts.toISOString(),
          p_ends_at: ends.toISOString(),
          p_guest_names: input.guestNames,
          p_notes: input.purpose,
          p_idempotency_key: crypto.randomUUID()
        });
        if (error) throw error;
        const created: Booking = {
          id: data,
          resourceId: resource.id,
          ownerId: member.id,
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          purpose: input.purpose,
          guestNames: input.guestNames,
          state: "confirmed",
          createdAt: new Date().toISOString()
        };
        await refresh();
        setNotice("Booking confirmed.");
        return created;
      }

      const period = validateDemoBooking(state, member, resource, input);
      const created: Booking = {
        id: randomId("booking"),
        resourceId: resource.id,
        ownerId: member.id,
        startsAt: period.starts.toISOString(),
        endsAt: period.ends.toISOString(),
        purpose: input.purpose,
        guestNames: input.guestNames,
        state: "confirmed",
        createdAt: new Date().toISOString()
      };
      setState((value) => ({
        ...value,
        bookings: [...value.bookings, created],
        calendarSync: [
          ...value.calendarSync,
          {
            id: randomId("sync"),
            bookingId: created.id,
            resourceId: resource.id,
            operation: "create",
            state: "queued",
            attempts: 0,
            message: "Waiting for Google Calendar integration"
          }
        ]
      }));
      setNotice("Booking confirmed in the local demo ledger.");
      return created;
    },
    [refresh, state]
  );

  const cancelBooking = useCallback(
    async (id: string) => {
      if (supabase) {
        const { error } = await supabase.rpc("cancel_booking", {
          p_booking_id: id,
          p_reason: "Cancelled by member"
        });
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => ({
          ...value,
          bookings: value.bookings.map((booking) =>
            booking.id === id
              ? { ...booking, state: "cancelled" }
              : booking
          )
        }));
      }
      setNotice("Booking cancelled.");
    },
    [refresh]
  );

  const rescheduleBooking = useCallback(
    async (id: string, startsAt: string, durationMinutes: number) => {
      const booking = state.bookings.find((item) => item.id === id);
      const resource = booking
        ? state.resources.find((item) => item.id === booking.resourceId)
        : null;
      const member = booking
        ? state.profiles.find((profile) => profile.id === booking.ownerId)
        : null;
      if (!booking || !resource || !member) {
        throw new Error("Booking context is missing.");
      }
      const starts = parseISO(startsAt);
      const ends = addMinutes(starts, durationMinutes);
      if (supabase) {
        const { data: current, error: currentError } = await supabase
          .from("bookings")
          .select("updated_at")
          .eq("id", id)
          .single();
        if (currentError) throw currentError;
        const { error } = await supabase.rpc("reschedule_booking", {
          p_booking_id: id,
          p_starts_at: starts.toISOString(),
          p_ends_at: ends.toISOString(),
          p_expected_updated_at: current.updated_at
        });
        if (error) throw error;
        await refresh();
      } else {
        validateDemoBooking(
          {
            ...state,
            bookings: state.bookings.filter((item) => item.id !== id)
          },
          member,
          resource,
          {
            resourceId: resource.id,
            startsAt: starts.toISOString(),
            durationMinutes,
            purpose: booking.purpose,
            guestNames: booking.guestNames
          }
        );
        setState((value) => ({
          ...value,
          bookings: value.bookings.map((item) =>
            item.id === id
              ? {
                  ...item,
                  startsAt: starts.toISOString(),
                  endsAt: ends.toISOString()
                }
              : item
          )
        }));
      }
      setNotice("Booking rescheduled.");
    },
    [refresh, state]
  );

  const decideMembership = useCallback(
    async (applicationId: string, approved: boolean) => {
      if (supabase) {
        const { error } = await supabase.rpc("decide_membership", {
          p_application_id: applicationId,
          p_decision: approved ? "approved" : "rejected",
          p_notes: approved
            ? "Approved in Armature operations"
            : "Declined in Armature operations"
        });
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => {
          const application = value.applications.find(
            (item) => item.id === applicationId
          );
          return {
            ...value,
            profiles: value.profiles.map((profile) =>
              profile.id === application?.memberId
                ? {
                    ...profile,
                    membershipState: approved ? "active" : "cancelled"
                  }
                : profile
            ),
            applications: value.applications.map((item) =>
              item.id === applicationId
                ? { ...item, state: approved ? "approved" : "declined" }
                : item
            )
          };
        });
      }
      setNotice(approved ? "Member approved." : "Application declined.");
    },
    [refresh]
  );

  const issueCertification = useCallback(
    async (
      memberId: string,
      certificationName: string,
      expiresAt: string,
      notes: string
    ) => {
      if (supabase) {
        const { data: certification, error: typeError } = await supabase
          .from("certification_types")
          .select("id")
          .eq("name", certificationName)
          .eq("active", true)
          .single();
        if (typeError) throw typeError;
        const { error } = await supabase.rpc("issue_certification", {
          p_member_id: memberId,
          p_certification_type_id: certification.id,
          p_expires_at: expiresAt
            ? new Date(expiresAt).toISOString()
            : undefined,
          p_notes: notes || undefined
        });
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => ({
          ...value,
          profiles: value.profiles.map((profile) =>
            profile.id === memberId &&
            !profile.certifications.includes(certificationName)
              ? {
                  ...profile,
                  certifications: [
                    ...profile.certifications,
                    certificationName
                  ]
                }
              : profile
          )
        }));
      }
      setNotice("Certification issued.");
    },
    [refresh]
  );

  const setBookingStatus = useCallback(
    async (
      bookingId: string,
      status: "cancelled" | "no_show" | "completed",
      reason: string
    ) => {
      if (supabase) {
        const { error } = await supabase.rpc("staff_set_booking_status", {
          p_booking_id: bookingId,
          p_status: status,
          p_reason: reason
        });
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => ({
          ...value,
          bookings: value.bookings.map((booking) =>
            booking.id === bookingId ? { ...booking, state: status } : booking
          )
        }));
      }
      setNotice(`Booking marked ${status.replace("_", " ")}.`);
    },
    [refresh]
  );

  const toggleResource = useCallback(
    async (resourceId: string) => {
      const resource = state.resources.find((item) => item.id === resourceId);
      if (!resource) return;
      if (supabase) {
        const { error } = await supabase
          .from("resources")
          .update({ reservable: !resource.available })
          .eq("id", resourceId);
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => ({
          ...value,
          resources: value.resources.map((item) =>
            item.id === resourceId
              ? { ...item, available: !item.available }
              : item
          )
        }));
      }
    },
    [refresh, state.resources]
  );

  const createResourceBlock = useCallback(
    async (input: ResourceBlockInput) => {
      if (supabase) {
        const { error } = await supabase.rpc("create_resource_block", {
          p_resource_id: input.resourceId,
          p_starts_at: input.startsAt,
          p_ends_at: input.endsAt,
          p_kind: input.kind,
          p_reason: input.reason
        });
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => ({
          ...value,
          resources: value.resources.map((resource) =>
            resource.id === input.resourceId
              ? { ...resource, available: false }
              : resource
          )
        }));
      }
      setNotice("Resource block created.");
    },
    [refresh]
  );

  const setResourceHours = useCallback(
    async (input: ResourceHoursInput) => {
      if (supabase) {
        const { error } = await supabase.rpc("set_resource_hours", {
          p_resource_id: input.resourceId,
          p_day_of_week: input.dayOfWeek,
          p_opens_at: input.opensAt || undefined,
          p_closes_at: input.closesAt || undefined
        });
        if (error) throw error;
        await refresh();
      }
      setNotice(
        input.opensAt
          ? "Operating hours updated."
          : "Resource closed for that weekday."
      );
    },
    [refresh]
  );

  const createKioskEnrollment = useCallback(
    async (name: string) => {
      if (!supabase) {
        return {
          token: `demo-enroll-${crypto.randomUUID()}`,
          expiresAt: addMinutes(new Date(), 10).toISOString()
        };
      }
      const { data: location, error: locationError } = await supabase
        .from("locations")
        .select("id")
        .eq("active", true)
        .order("created_at")
        .limit(1)
        .single();
      if (locationError) throw locationError;
      const { data, error } = await supabase.functions.invoke("kiosk", {
        body: {
          action: "create_enrollment",
          location_id: location.id,
          name
        }
      });
      if (error) throw error;
      const result = data as { token?: string; expires_at?: string };
      if (!result.token || !result.expires_at) {
        throw new Error("The kiosk enrollment response was incomplete.");
      }
      return { token: result.token, expiresAt: result.expires_at };
    },
    []
  );

  const createCheckinIntent = useCallback(
    async (
      bookingId?: string,
      action: CheckinAction = "check_in"
    ): Promise<CheckinIntent> => {
      if (!state.currentUserId) {
        throw new Error("Sign in before creating a check-in code.");
      }
      let selectedBookingId = bookingId;
      if (!selectedBookingId && action === "check_in") {
        selectedBookingId = state.bookings.find((booking) => {
          if (
            booking.ownerId !== state.currentUserId ||
            booking.state !== "confirmed"
          ) {
            return false;
          }
          const opens = addMinutes(parseISO(booking.startsAt), -15);
          const closes = addMinutes(parseISO(booking.startsAt), 30);
          return (
            !isBefore(new Date(), opens) && !isAfter(new Date(), closes)
          );
        })?.id;
      }
      if (!selectedBookingId && action === "check_out") {
        selectedBookingId = state.attendance.find(
          (session) =>
            session.memberId === state.currentUserId &&
            session.state === "open"
        )?.bookingId;
      }
      if (!selectedBookingId) {
        throw new Error(
          action === "check_in"
            ? "No booking is inside its check-in window."
            : "No active attendance session was found."
        );
      }

      if (supabase) {
        const { data, error } = await supabase.rpc("create_checkin_intent", {
          p_booking_id: selectedBookingId,
          p_action: action
        });
        if (error) throw error;
        const result = data as {
          token?: string;
          expires_at?: string;
        };
        if (!result.token || !result.expires_at) {
          throw new Error("The check-in response was incomplete.");
        }
        return {
          token: result.token,
          memberId: state.currentUserId,
          bookingId: selectedBookingId,
          action,
          expiresAt: result.expires_at
        };
      }

      const intent: CheckinIntent = {
        token: crypto.randomUUID(),
        memberId: state.currentUserId,
        bookingId: selectedBookingId,
        action,
        expiresAt: addMinutes(new Date(), 1).toISOString()
      };
      setState((value) => ({
        ...value,
        checkinIntents: [
          ...value.checkinIntents.filter(
            (item) => item.memberId !== value.currentUserId
          ),
          intent
        ]
      }));
      return intent;
    },
    [state]
  );

  const redeemCheckinIntent = useCallback(
    async (token: string) => {
      if (supabase) {
        throw new Error(
          "Enroll this kiosk before scanning a live member code."
        );
      }
      let message = "";
      setState((value) => {
        const intent = value.checkinIntents.find(
          (item) => item.token === token
        );
        if (!intent) throw new Error("Unknown check-in code.");
        if (intent.redeemedAt) {
          throw new Error("This check-in code has already been used.");
        }
        if (isAfter(new Date(), parseISO(intent.expiresAt))) {
          throw new Error("This check-in code has expired.");
        }
        const member = value.profiles.find(
          (profile) => profile.id === intent.memberId
        );
        if (member?.membershipState !== "active") {
          throw new Error("Membership is not active.");
        }
        if (intent.action === "check_out") {
          if (
            hasOpenDemoLoans(intent.memberId) ||
            hasOpenDemoToolkitRental(intent.memberId)
          ) {
            throw new Error(
              "Return all lab-only component loans and toolkits before checking out."
            );
          }
          const session = value.attendance.find(
            (item) =>
              item.memberId === intent.memberId && item.state === "open"
          );
          if (!session) throw new Error("No active session was found.");
          message = `Check-out recorded for ${member.name}.`;
          return {
            ...value,
            checkinIntents: value.checkinIntents.map((item) =>
              item.token === token
                ? { ...item, redeemedAt: new Date().toISOString() }
                : item
            ),
            attendance: value.attendance.map((item) =>
              item.id === session.id
                ? {
                    ...item,
                    checkedOutAt: new Date().toISOString(),
                    state: "closed"
                  }
                : item
            )
          };
        }

        const booking = value.bookings.find(
          (item) =>
            item.id === intent.bookingId &&
            item.ownerId === intent.memberId &&
            item.state === "confirmed"
        );
        if (!booking) throw new Error("Confirmed booking not found.");
        const opens = addMinutes(parseISO(booking.startsAt), -15);
        const closes = addMinutes(parseISO(booking.startsAt), 30);
        if (isBefore(new Date(), opens) || isAfter(new Date(), closes)) {
          throw new Error("No booking is inside its check-in window.");
        }
        if (
          value.attendance.some(
            (session) =>
              session.memberId === intent.memberId &&
              session.state === "open"
          )
        ) {
          throw new Error("This member is already checked in.");
        }
        message = `Check-in accepted for ${member.name}.`;
        return {
          ...value,
          checkinIntents: value.checkinIntents.map((item) =>
            item.token === token
              ? { ...item, redeemedAt: new Date().toISOString() }
              : item
          ),
          attendance: [
            ...value.attendance,
            {
              id: randomId("attendance"),
              bookingId: booking.id,
              memberId: intent.memberId,
              checkedInAt: new Date().toISOString(),
              state: "open"
            }
          ]
        };
      });
      return message;
    },
    []
  );

  const checkOut = useCallback(
    async (attendanceId: string) => {
      const session = state.attendance.find(
        (item) => item.id === attendanceId
      );
      if (!session) return;
      if (supabase) {
        const { error } = await supabase.rpc("staff_override_attendance", {
          p_user_id: session.memberId,
          p_booking_id: session.bookingId,
          p_action: "check_out",
          p_reason: "Staff checkout from the attendance monitor"
        });
        if (error) throw error;
        await refresh();
      } else {
        setState((value) => ({
          ...value,
          attendance: value.attendance.map((item) =>
            item.id === attendanceId
              ? {
                  ...item,
                  checkedOutAt: new Date().toISOString(),
                  state: "closed"
                }
              : item
          )
        }));
      }
      setNotice("Attendance session closed.");
    },
    [refresh, state.attendance]
  );

  const resetDemo = useCallback(() => {
    if (dataMode !== "demo") return;
    setState(initialDemoState);
    setIsStaff(false);
    setIsAdmin(false);
    setNotice("Demo data reset.");
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      currentMember,
      mode: dataMode,
      online,
      loading,
      isStaff,
      isAdmin,
      notice,
      clearNotice: () => setNotice(""),
      refresh,
      signInDemo,
      signOut,
      requestOtp,
      signInGoogle,
      uploadAvatar,
      updateProfile,
      submitApplication,
      listAvailability,
      createBooking,
      cancelBooking,
      rescheduleBooking,
      decideMembership,
      issueCertification,
      setBookingStatus,
      toggleResource,
      createResourceBlock,
      setResourceHours,
      createKioskEnrollment,
      createCheckinIntent,
      redeemCheckinIntent,
      checkOut,
      resetDemo
    }),
    [
      state,
      currentMember,
      online,
      loading,
      isStaff,
      isAdmin,
      notice,
      refresh,
      signInDemo,
      signOut,
      requestOtp,
      signInGoogle,
      uploadAvatar,
      updateProfile,
      submitApplication,
      listAvailability,
      createBooking,
      cancelBooking,
      rescheduleBooking,
      decideMembership,
      issueCertification,
      setBookingStatus,
      toggleResource,
      createResourceBlock,
      setResourceHours,
      createKioskEnrollment,
      createCheckinIntent,
      redeemCheckinIntent,
      checkOut,
      resetDemo
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}

export function resourceFor(resources: Resource[], resourceId: string) {
  return resources.find((resource) => resource.id === resourceId);
}
