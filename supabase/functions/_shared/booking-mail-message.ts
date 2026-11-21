import { bookingCalendarInvite, bookingNotice } from "./booking-notice.ts";
import { bytesToBase64Url } from "./crypto.ts";

export const bookingMailFrom = "bookings@armatureailabs.com";
type Notice = Parameters<typeof bookingNotice>[0];

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return Array.from(bytes, byte => String.fromCharCode(byte)).join("");
}

function base64Lines(value: string): string {
  return btoa(encode(value)).match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function bookingMailMessage(input: Notice, delivery: {
  id: string;
  aggregateId: string;
  recipient: string;
  createdAt: string;
  sequence: number;
}): string {
  if (!/^[0-9a-f-]{36}$/i.test(delivery.id) ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(delivery.recipient)) {
    throw new Error("Invalid booking mail delivery identity");
  }
  const notice = bookingNotice(input);
  const boundary = "armature-booking-" + delivery.id;
  const method = input.stage === "cancelled" ? "CANCEL" : "REQUEST";
  const headers = [
    `From: Armature AI Labs Bookings <${bookingMailFrom}>`,
    `Reply-To: ${bookingMailFrom}`,
    `To: ${delivery.recipient}`,
    `Subject: =?UTF-8?B?${btoa(encode(notice.subject))}?=`,
    `Message-ID: <booking-${delivery.id}@armatureailabs.com>`,
    `Date: ${new Date(delivery.createdAt).toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(notice.text),
  ];
  for (const [index, event] of notice.events.entries()) {
    const invite = bookingCalendarInvite(event, {
      bookingId: delivery.aggregateId,
      organizer: bookingMailFrom,
      attendee: delivery.recipient,
      sequence: delivery.sequence,
      method,
      sentAt: delivery.createdAt,
    });
    headers.push(
      `--${boundary}`,
      `Content-Type: text/calendar; charset="UTF-8"; method=${method}; name="booking-${index + 1}.ics"`,
      `Content-Disposition: attachment; filename="booking-${index + 1}.ics"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(invite),
    );
  }
  return bytesToBase64Url(new TextEncoder().encode(headers.concat(`--${boundary}--`, "").join("\r\n")));
}
