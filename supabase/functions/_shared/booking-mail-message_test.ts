import assert from "node:assert/strict";
import { bookingMailMessage } from "./booking-mail-message.ts";
import { base64UrlToBytes } from "./crypto.ts";

const delivery = {
  id: "90000000-0000-4000-8000-000000000001",
  aggregateId: "90000000-0000-4000-8000-000000000002",
  recipient: "internal@example.test", sequence: 3, createdAt: "2026-11-21T04:00:00.000Z",
};
const decode = (raw: string) => new TextDecoder().decode(base64UrlToBytes(raw));

Deno.test("email uses the verified send-as alias and embeds a busy Guest Pass invite", () => {
  const mail = decode(bookingMailMessage({ kind: "guest", stage: "confirmed", reference: "TEST", guestDate: "2026-12-01" }, delivery));
  assert(mail.includes("From: Armature AI Labs Bookings <bookings@armatureailabs.com>"));
  assert(mail.includes("Reply-To: bookings@armatureailabs.com"));
  assert(mail.includes("To: internal@example.test"));
  const sections = mail.split("--armature-booking-" + delivery.id);
  const body = (part: string) => atob(part.trim().split("\r\n\r\n")[1].replaceAll("\r\n", ""));
  const text = body(sections[1]);
  assert(text.includes("does not reserve a desk or seat"));
  const calendarLink = text.match(/Add to Google Calendar: (https:[^\s]+)/)?.[1];
  assert(calendarLink);
  const calendar = new URL(calendarLink);
  assert.equal(calendar.hostname, "calendar.google.com");
  assert.equal(calendar.searchParams.get("dates"), "20261201T033000Z/20261201T163000Z");
  assert.equal(calendar.searchParams.get("ctz"), "Asia/Kolkata");
  assert.match(calendar.searchParams.get("location") ?? "", /1490, 11th Cross/);
  assert(sections[2].includes("text/calendar; charset=\"UTF-8\"; method=REQUEST"));
  const invite = body(sections[2]);
  assert(invite.includes("DTSTART:20261201T033000Z"));
  assert(invite.includes("DTEND:20261201T163000Z"));
  assert(invite.includes("TRANSP:OPAQUE"));
  assert(invite.includes("ATTENDEE"));
});

Deno.test("pending visit acknowledgment has no invite and rejects injected headers", () => {
  const notice = { kind: "guest", stage: "received", reference: "TEST", guestDate: "2026-12-01" } as const;
  const mail = decode(bookingMailMessage(notice, delivery));
  assert.equal(mail.includes("text/calendar"), false);
  const cancelled = decode(bookingMailMessage({ ...notice, stage: "cancelled" }, delivery));
  const part = cancelled.split("--armature-booking-" + delivery.id)[1];
  assert(!atob(part.trim().split("\r\n\r\n")[1].replaceAll("\r\n", "")).includes("Add to Google Calendar"));
  assert.throws(() => bookingMailMessage(notice, { ...delivery, recipient: "internal@example.test\r\nBcc: customer@example.test" }));
});
