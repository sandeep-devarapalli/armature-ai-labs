import { deepStrictEqual as assertEquals, match as assertMatch, throws as assertThrows } from "node:assert/strict";
import { bookingCalendarInvite, bookingNotice, guestPassSession } from "./booking-notice.ts";

Deno.test("Guest Pass confirms standard lab hours without a reserved seat", () => {
  const input = { kind: "guest", reference: "GP-001", guestDate: "2026-11-23" } as const;
  const confirmation = bookingNotice({ ...input, stage: "confirmed" });
  assertMatch(confirmation.text, /does not reserve a desk or seat/);
  assertMatch(confirmation.text, /9:00 am–5:00 pm IST/i);
  assertMatch(confirmation.text, /1490, 11th Cross, 20th Main Rd, 1st Sector, HSR Layout, Bengaluru, Karnataka 560102/);
  assertMatch(confirmation.events[0].description, /www\.google\.com\/maps\/dir/);
  assertEquals(confirmation.events[0].startsAt, "2026-11-23T09:00:00+05:30");
  assertEquals(bookingNotice({ ...input, stage: "received" }).events, []);
  assertThrows(() => guestPassSession("2026-02-31"));
});

Deno.test("Desk week uses only booked sessions and cancellation preserves their UIDs", () => {
  const sessions = ["2026-11-23", "2026-11-25"].map((day) => ({ ...guestPassSession(day), id: day }));
  const notice = bookingNotice({ kind: "week", stage: "confirmed", reference: "W-123", sessions, resource: "Desk S13" });
  assertEquals(notice.events.map((event) => event.id), ["2026-11-23", "2026-11-25"]);
  assertMatch(notice.events[0].summary, /Week Pass · Desk S13/);
  const options = { bookingId: "book-123", organizer: "bookings@armatureailabs.com",
    attendee: "visit@example.test", sentAt: "2026-11-21T00:00:00Z" };
  const first = bookingCalendarInvite(notice.events[0], { ...options, method: "REQUEST", sequence: 0 });
  const second = bookingCalendarInvite(notice.events[0], { ...options, method: "CANCEL", sequence: 1 });
  assertMatch(first, /METHOD:REQUEST\r\n/);
  assertMatch(first, /DTSTART:20261123T033000Z\r\nDTEND:20261123T113000Z/);
  assertMatch(second, /METHOD:CANCEL\r\n/);
  assertMatch(second, /STATUS:CANCELLED/);
  assertEquals(first.match(/UID:[^\r]*/)?.[0], second.match(/UID:[^\r]*/)?.[0]);
  assertMatch(second, /SEQUENCE:1/);
  assertEquals(first.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75), true);
});

Deno.test("Rental milestones create an invite only once a real appointment exists", () => {
  const cabin = { kind: "cabin", reference: "CAB-001", resource: "Cabin 101" } as const;
  assertMatch(bookingNotice({ ...cabin, stage: "signing" }).subject, /Agreement ready/);
  assertEquals(bookingNotice({ ...cabin, stage: "payment_due" }).events, []);
  assertEquals(bookingNotice({ ...cabin, stage: "confirmed" }).events, []);
  const session = { id: "handover", startsAt: "2027-01-07T12:00:00+05:30", endsAt: "2027-01-07T12:30:00+05:30" };
  assertEquals(bookingNotice({ ...cabin, stage: "confirmed", sessions: [session] }).events.length, 1);
  assertEquals(bookingNotice({ kind: "equipment", stage: "confirmed", reference: "EQ-001", sessions: [session] }).events.length, 1);
});
