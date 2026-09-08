import { corsHeaders } from "../_shared/cors.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import {
  adminClient,
  authenticatedUser,
  requireStaff,
} from "../_shared/supabase.ts";

function icsEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function icsDate(value: string): string {
  return new Date(value)
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/u, "Z");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "GET") {
    return json(request, { error: "method_not_allowed" }, 405);
  }

  try {
    const user = await authenticatedUser(request);
    const bookingId = new URL(request.url).searchParams.get("booking_id");
    if (!bookingId) {
      throw new HttpError(400, "booking_id is required.", "missing_booking_id");
    }

    const client = adminClient();
    const { data: booking, error } = await client
      .from("bookings")
      .select("id, member_id, resource_id, starts_at, ends_at, status, updated_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !booking) {
      throw new HttpError(404, "Booking not found.", "booking_not_found");
    }

    if (booking.member_id !== user.id) {
      await requireStaff(user.id, ["operations", "admin", "super_admin"]);
    }

    const { data: resource, error: resourceError } = await client
      .from("resources")
      .select("name, locations(name, address)")
      .eq("id", booking.resource_id)
      .maybeSingle();
    if (resourceError || !resource) {
      throw new HttpError(404, "Booking resource not found.", "resource_not_found");
    }

    const locationValue = resource.locations as
      | { name?: string; address?: string }
      | Array<{ name?: string; address?: string }>
      | null;
    const location = Array.isArray(locationValue)
      ? locationValue[0]
      : locationValue;
    const status = booking.status === "cancelled" ? "CANCELLED" : "CONFIRMED";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Armature AI Labs//Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${booking.id}@armaturelab.org`,
      `DTSTAMP:${icsDate(booking.updated_at)}`,
      `DTSTART:${icsDate(booking.starts_at)}`,
      `DTEND:${icsDate(booking.ends_at)}`,
      `SUMMARY:${icsEscape(`Armature AI Labs - ${resource.name}`)}`,
      `DESCRIPTION:${icsEscape(`Manage this booking at https://armatureailabs.com/bookings/${booking.id}`)}`,
      `LOCATION:${icsEscape(
        [location?.name, location?.address].filter(Boolean).join(", "),
      )}`,
      `STATUS:${status}`,
      `URL:https://armatureailabs.com/bookings/${booking.id}`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ];

    return new Response(lines.join("\r\n"), {
      status: 200,
      headers: {
        ...corsHeaders(request),
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="armature-ai-labs-booking-${booking.id}.ics"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
