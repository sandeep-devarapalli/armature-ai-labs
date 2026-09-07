import { corsHeaders } from "../_shared/cors.ts";
import { assertJobSecret } from "../_shared/env.ts";
import { googleCalendarRequest } from "../_shared/google.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

interface OutboxRow {
  id: string;
  aggregate_id: string;
  aggregate_type: string;
  action: "create" | "update" | "cancel" | "remind";
}

interface BookingRow {
  id: string;
  member_id: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: string;
}

interface ResourceRow {
  id: string;
  name: string;
  location_id: string;
}

interface CalendarLinkRow {
  id: string;
  provider_calendar_id: string;
  timezone: string;
}

function providerEventId(bookingId: string): string {
  return `armature${bookingId.replaceAll("-", "")}`;
}

async function eventPayload(
  booking: BookingRow,
  resource: ResourceRow,
): Promise<Record<string, unknown>> {
  const client = adminClient();
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    client
      .from("profiles")
      .select("display_name")
      .eq("id", booking.member_id)
      .maybeSingle(),
    client.auth.admin.getUserById(booking.member_id),
  ]);
  const attendeeEmail = authUser.user?.email;

  return {
    id: providerEventId(booking.id),
    summary: `${resource.name} - ${profile?.display_name || "Armature AI Labs member"}`,
    description: [
      "Armature AI Labs resource booking",
      `Booking: ${booking.id}`,
      `Manage: https://armatureailabs.com/bookings/${booking.id}`,
    ].join("\n"),
    start: { dateTime: booking.starts_at },
    end: { dateTime: booking.ends_at },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    extendedProperties: {
      private: {
        armatureBookingId: booking.id,
        armatureResourceId: booking.resource_id,
        sourceOfTruth: "supabase",
      },
    },
  };
}

async function parseGoogleResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function upsertProviderEvent(
  calendarId: string,
  eventId: string,
  payload: Record<string, unknown>,
  preferInsert: boolean,
): Promise<Record<string, unknown>> {
  const calendar = encodeURIComponent(calendarId);
  const event = encodeURIComponent(eventId);
  const sendUpdates = encodeURIComponent(Deno.env.get("GOOGLE_SEND_UPDATES") ?? "all");
  let response: Response;

  if (preferInsert) {
    response = await googleCalendarRequest(
      `/calendars/${calendar}/events?sendUpdates=${sendUpdates}`,
      { method: "POST", body: JSON.stringify(payload) },
    );

    if (response.status === 409) {
      response = await googleCalendarRequest(
        `/calendars/${calendar}/events/${event}?sendUpdates=${sendUpdates}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
    }
  } else {
    response = await googleCalendarRequest(
      `/calendars/${calendar}/events/${event}?sendUpdates=${sendUpdates}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );

    if (response.status === 404 || response.status === 410) {
      response = await googleCalendarRequest(
        `/calendars/${calendar}/events?sendUpdates=${sendUpdates}`,
        { method: "POST", body: JSON.stringify(payload) },
      );
    }
  }

  const result = await parseGoogleResponse(response);
  if (!response.ok) {
    throw new Error(
      `Google Calendar upsert failed (${response.status}): ${JSON.stringify(result)}`,
    );
  }
  return result;
}

async function deleteProviderEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  const sendUpdates = encodeURIComponent(Deno.env.get("GOOGLE_SEND_UPDATES") ?? "all");
  const response = await googleCalendarRequest(
    `/calendars/${encodeURIComponent(calendarId)}/events/${
      encodeURIComponent(eventId)
    }?sendUpdates=${sendUpdates}`,
    { method: "DELETE" },
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(
      `Google Calendar delete failed (${response.status}): ${await response.text()}`,
    );
  }
}

async function processBooking(row: OutboxRow): Promise<void> {
  const client = adminClient();
  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("id, member_id, resource_id, starts_at, ends_at, notes, status")
    .eq("id", row.aggregate_id)
    .maybeSingle<BookingRow>();

  if (bookingError || !booking) {
    throw new Error(`Booking ${row.aggregate_id} was not found.`);
  }

  const [{ data: resource, error: resourceError }, { data: link, error: linkError }] =
    await Promise.all([
      client
        .from("resources")
        .select("id, name, location_id")
        .eq("id", booking.resource_id)
        .maybeSingle<ResourceRow>(),
      client
        .from("calendar_links")
        .select("id, provider_calendar_id, timezone")
        .eq("resource_id", booking.resource_id)
        .eq("active", true)
        .maybeSingle<CalendarLinkRow>(),
    ]);

  if (resourceError || !resource) {
    throw new Error(`Resource ${booking.resource_id} was not found.`);
  }
  if (linkError || !link) {
    throw new Error(`No active Google calendar is linked to ${resource.name}.`);
  }

  const eventId = providerEventId(booking.id);

  if (row.action === "cancel" || booking.status === "cancelled") {
    await deleteProviderEvent(link.provider_calendar_id, eventId);
    const { error } = await client.from("calendar_sync_state").upsert({
      booking_id: booking.id,
      calendar_link_id: link.id,
      provider_event_id: eventId,
      status: "deleted",
      last_synced_at: new Date().toISOString(),
      last_error: null,
    });
    if (error) throw error;
    return;
  }

  const payload = await eventPayload(booking, resource);
  const providerEvent = await upsertProviderEvent(
    link.provider_calendar_id,
    eventId,
    payload,
    row.action === "create",
  );
  const { error } = await client.from("calendar_sync_state").upsert({
    booking_id: booking.id,
    calendar_link_id: link.id,
    provider_event_id: String(providerEvent.id ?? eventId),
    provider_etag:
      typeof providerEvent.etag === "string" ? providerEvent.etag : null,
    status: "synced",
    last_synced_at: new Date().toISOString(),
    external_updated_at:
      typeof providerEvent.updated === "string" ? providerEvent.updated : null,
    last_error: null,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "method_not_allowed" }, 405);
  }

  try {
    assertJobSecret(request);
    const client = adminClient();
    const workerId = `calendar-sync-${crypto.randomUUID()}`;
    const { data, error } = await client.rpc("claim_integration_outbox", {
      p_worker: workerId,
      p_limit: 25,
    });

    if (error) {
      throw new HttpError(500, error.message, "outbox_claim_failed");
    }

    const rows = (data ?? []) as OutboxRow[];
    const results: Array<{ id: string; status: "succeeded" | "failed"; error?: string }> =
      [];

    for (const row of rows) {
      try {
        if (row.aggregate_type !== "booking") {
          throw new Error(`Unsupported outbox aggregate: ${row.aggregate_type}`);
        }
        await processBooking(row);
        const { error: completeError } = await client.rpc(
          "complete_integration_outbox",
          { p_id: row.id },
        );
        if (completeError) throw completeError;
        results.push({ id: row.id, status: "succeeded" });
      } catch (processingError) {
        const message = processingError instanceof Error
          ? processingError.message
          : String(processingError);
        await client.rpc("fail_integration_outbox", {
          p_id: row.id,
          p_error: message,
        });
        results.push({ id: row.id, status: "failed", error: message });
      }
    }

    return json(request, {
      claimed: rows.length,
      succeeded: results.filter((result) => result.status === "succeeded").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
