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

function htmlBody(mail: string) {
  const encoded = mail.match(/Content-Type: text\/html[^\r]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/)?.[1];
  assert(encoded);
  return new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
}

Deno.test("Golden Pass application alert directs staff to the private review queue", () => {
  const mail = decode(bookingMailMessage({
    kind: "golden_application", stage: "received", reference: delivery.aggregateId,
  }, { ...delivery, recipient: "hello@armatureailabs.com", memberName: "Applicant Fixture" }));
  const part = mail.split("--armature-booking-" + delivery.id)[1];
  const text = atob(part.trim().split("\r\n\r\n")[1].replaceAll("\r\n", ""));
  assert.match(mail, /To: hello@armatureailabs\.com/);
  assert.match(text, /https:\/\/armatureailabs\.com\/admin\/passes#golden-pass-applications/);
  assert.doesNotMatch(text, /Applicant Fixture|example\.test/);
  assert.doesNotMatch(mail, /text\/calendar/);
});

Deno.test("Day Pass receipt escapes member names and preserves Maps and calendar", () => {
  const mail = decode(bookingMailMessage({
    kind: "day", stage: "confirmed", reference: "AB12CD34", resource: "Chair S01",
    sessions: [{ id: "day", startsAt: "2026-11-23T03:30:00Z", endsAt: "2026-11-23T11:30:00Z" }],
  }, { ...delivery, memberName: "Aditi <Rao>" }));
  const html = htmlBody(mail);
  assert.match(html, /Aditi &lt;Rao&gt;/);
  assert.match(html, /AB12CD34/);
  assert.match(html, /S1 · Ground floor/);
  assert.match(html, /google\.com\/maps/);
  assert.match(html, /20261123T033000Z%2F20261123T113000Z/);
  const boundaries = [...mail.matchAll(/boundary="([^"]+)"/g)].map(match => match[1]);
  assert.equal(boundaries.length, 2);
  assert(!boundaries[1].startsWith(boundaries[0]));
  assert.match(mail, /Content-Type: multipart\/alternative/);
  assert.match(mail, /Content-Disposition: attachment; filename="booking-1.ics"/);
  assert.match(mail, /text\/calendar; charset="UTF-8"; method=REQUEST; component=vevent/);
});

Deno.test("Golden Pass welcome includes the paid term without a calendar attachment", () => {
  const mail = decode(bookingMailMessage({
    kind: "golden", stage: "confirmed", amountPaise: 10_000_000,
    startsAt: "2026-11-21T04:00:00Z", endsAt: "2027-11-21T04:00:00Z",
  }, { ...delivery, memberName: "Aditi Rao" }));
  const html = htmlBody(mail);
  assert.match(html, /Aditi Rao/);
  assert.match(html, /21 November 2027/);
  assert.match(html, /₹1,00,000/);
  assert.doesNotMatch(mail, /text\/calendar/);
});

function plainBody(mail: string) {
  const encoded = mail.match(/Content-Type: text\/plain[^\r]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/)?.[1];
  assert(encoded);
  return new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)));
}

Deno.test("Venture notices link to the right account screen and show the exact IST payment deadline", () => {
  const review = decode(bookingMailMessage({ kind: "venture_application", stage: "received", reference: delivery.aggregateId }, {
    ...delivery, recipient: "hello@armatureailabs.com",
  }));
  assert.match(plainBody(review), /\/admin\/booking-management#venture-partner-pass-applications/);
  assert.doesNotMatch(plainBody(review), /\bpay|₹/i);

  const approved = decode(bookingMailMessage({ kind: "venture", stage: "approved", reference: delivery.aggregateId,
    paymentExpiresAt: "2026-11-24T13:29:37Z",
  }, delivery));
  assert.match(plainBody(approved), /₹5,00,000/);
  assert.match(plainBody(approved), /24 Nov,? 2026, 6:59:37\s*pm IST/i);
  assert.match(plainBody(approved), /https:\/\/armatureailabs.com\/venture-partner-pass#apply/);
  assert.doesNotMatch(plainBody(approved), /razorpay\.com|rzp\.io/i);

  const confirmed = decode(bookingMailMessage({ kind: "venture", stage: "confirmed", reference: delivery.aggregateId,
    endsAt: "2027-11-24T13:12:00Z",
  }, delivery));
  assert.match(plainBody(confirmed), /has confirmed your ₹5,00,000 payment/);
  assert.match(plainBody(confirmed), /Membership ends:.*24 Nov,? 2027/);
  assert.match(plainBody(confirmed), new RegExp(delivery.aggregateId));
  assert.doesNotMatch(confirmed, /text\/calendar/);
});
