import { corsHeaders } from "../_shared/cors.ts";
import { assertJobSecret, requiredEnv } from "../_shared/env.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

interface ReminderRow {
  id: string;
  booking_id: string;
  reminder_kind: string;
  scheduled_for: string;
}

async function deliverReminder(reminder: ReminderRow): Promise<void> {
  const client = adminClient();
  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("id, member_id, resource_id, starts_at, ends_at, status")
    .eq("id", reminder.booking_id)
    .maybeSingle();

  if (bookingError || !booking || booking.status !== "confirmed") {
    throw new Error("Booking is no longer eligible for a reminder.");
  }

  const [{ data: resource }, { data: profile }, { data: authUser }] =
    await Promise.all([
      client.from("resources").select("name").eq("id", booking.resource_id)
        .maybeSingle(),
      client.from("profiles").select("display_name").eq("id", booking.member_id)
        .maybeSingle(),
      client.auth.admin.getUserById(booking.member_id),
    ]);
  const email = authUser.user?.email;

  if (!email) {
    throw new Error("Member does not have a deliverable email address.");
  }

  const webhookUrl = requiredEnv("REMINDER_WEBHOOK_URL");
  const webhookSecret = requiredEnv("REMINDER_WEBHOOK_SECRET");
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${webhookSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "booking_reminder",
      idempotency_key: `armature:${reminder.id}`,
      from: Deno.env.get("REMINDER_FROM") ?? "bookings@armaturelab.org",
      to: email,
      template: reminder.reminder_kind,
      data: {
        member_name: profile?.display_name || "Armature AI Labs member",
        resource_name: resource?.name || "Armature AI Labs resource",
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        booking_url: `https://armatureailabs.com/bookings/${booking.id}`,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Reminder webhook failed (${response.status}): ${await response.text()}`,
    );
  }
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
    const { data: maintenance, error: maintenanceError } = await client.rpc(
      "run_attendance_maintenance",
    );

    if (maintenanceError) {
      throw new HttpError(
        500,
        maintenanceError.message,
        "attendance_maintenance_failed",
      );
    }

    const { data, error } = await client.rpc("claim_due_reminders", {
      p_limit: 50,
    });
    if (error) {
      throw new HttpError(500, error.message, "reminder_claim_failed");
    }

    const reminders = (data ?? []) as ReminderRow[];
    const results: Array<{ id: string; status: "sent" | "failed"; error?: string }> =
      [];

    for (const reminder of reminders) {
      try {
        await deliverReminder(reminder);
        const { error: completeError } = await client.rpc("complete_reminder", {
          p_id: reminder.id,
        });
        if (completeError) throw completeError;
        results.push({ id: reminder.id, status: "sent" });
      } catch (deliveryError) {
        const message = deliveryError instanceof Error
          ? deliveryError.message
          : String(deliveryError);
        await client.rpc("fail_reminder", {
          p_id: reminder.id,
          p_error: message,
        });
        results.push({ id: reminder.id, status: "failed", error: message });
      }
    }

    return json(request, {
      maintenance,
      claimed: reminders.length,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    });
  } catch (error) {
    return errorResponse(request, error);
  }
});
