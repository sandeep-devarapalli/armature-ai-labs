import { bookingCalendarInvite, bookingDirections, bookingNotice } from "./booking-notice.ts";
import { bytesToBase64Url } from "./crypto.ts";

export const bookingMailFrom = "bookings@armatureailabs.com";
type DeskNotice = Parameters<typeof bookingNotice>[0];
type GoldenNotice = {kind: "golden"; stage: "confirmed"; startsAt: string; endsAt: string; amountPaise: number};
type Notice = DeskNotice | GoldenNotice;

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const labDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
});
const labDateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short",
});
const goldenUrl = "https://armatureailabs.com/golden-pass";

function receiptHtml(title: string, greeting: string, details: string[], links: [string, string][], intro = "", footer = "") {
  const rows = details.map(line => {
    const split = line.indexOf(": ");
    return split < 0 ? `<p>${escapeHtml(line)}</p>` : `<p style="border-bottom:1px solid #e7dfd2;padding-bottom:8px"><strong>${escapeHtml(line.slice(0, split))}</strong> · ${escapeHtml(line.slice(split + 2))}</p>`;
  }).join("");
  return `<div style="background:#f4f0e9;padding:16px;color:#211b13;font:16px/1.5 Arial,sans-serif"><div style="max-width:600px;margin:auto;background:#fffdf8"><div style="background:#342617;color:#fff3d6;padding:24px"><strong>Armature AI Labs</strong><h1 style="font:32px Georgia,serif;margin:10px 0 0">${title}</h1></div><div style="padding:24px"><p>${escapeHtml(greeting)}</p>${intro ? `<p>${intro}</p>` : ""}${rows}<p>${links.map(([label, url]) => `<a style="display:inline-block;background:#edd9ad;color:#211b13;padding:9px 12px;margin:4px 8px 4px 0;border-radius:5px" href="${escapeHtml(url)}">${label}</a>`).join("")}</p>${footer ? `<p>${footer}</p>` : ""}</div></div></div>`;
}

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
  memberName?: string;
}): string {
  if (!/^[0-9a-f-]{36}$/i.test(delivery.id) ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(delivery.recipient)) {
    throw new Error("Invalid booking mail delivery identity");
  }
  const golden = input.kind === "golden";
  const dayReceipt = input.kind === "day" && input.stage === "confirmed";
  const name = delivery.memberName?.trim();
  const greeting = name ? `Hi ${name},` : "Hello,";
  const welcome = "Your Golden Pass is active. Drop in during lab opening hours, get priority when booking workspace, and request priority access to lab equipment, including the 3D printer.";
  const goldenDetails = golden ? [
    name && `Member: ${name}`,
    `Active from: ${labDate.format(new Date(input.startsAt))}`,
    `Access ends: ${labDateTime.format(new Date(input.endsAt))} IST`,
    `Payment confirmed: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(input.amountPaise / 100)}`,
  ].filter((line): line is string => Boolean(line)) : [];
  const notice = golden ? { subject: "Your Armature AI Labs Golden Pass is active", text: "", events: [] } : bookingNotice(input);
  const boundary = "armature-booking-" + delivery.id;
  const method = input.stage === "cancelled" ? "CANCEL" : "REQUEST";
  const calendarLinks = method === "REQUEST" ? notice.events.map(event => {
    const url = new URL("https://calendar.google.com/calendar/render");
    const format = (value: string) => new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, "");
    url.search = new URLSearchParams({
      action: "TEMPLATE",
      text: event.summary,
      dates: format(event.startsAt) + "/" + format(event.endsAt),
      ctz: "Asia/Kolkata",
      location: event.location,
      details: event.description,
    }).toString();
    return `Add to Google Calendar: ${url}`;
  }) : [];
  const [overview, ...lines] = notice.text.split("\n");
  const details = lines.filter(line => !line.startsWith("Google Maps directions: ") && !line.startsWith("Booking page: "));
  const maps = lines.find(line => line.startsWith("Google Maps directions: "))?.slice("Google Maps directions: ".length);
  const booking = lines.find(line => line.startsWith("Booking page: "))?.slice("Booking page: ".length);
  const links: [string, string][] = [];
  if (maps) links.push(["Get directions", maps]);
  for (const entry of calendarLinks) links.push(["Add to Google Calendar", entry.slice("Add to Google Calendar: ".length)]);
  if (booking) links.push(["View booking", booking]);
  const calendarFooter = notice.events.length ? "Your calendar invite is attached." : "";
  const dayDetails = [...(name ? [`Booked for: ${name}`] : []),
    ...details.map(line => line
      .replace(/^Resource: Chair S0?(\d+)$/, "Seat: S$1 · Ground floor")
      .replace(/^Reference: /, "Booking reference: "))];
  const html = golden ? receiptHtml("A year to build at the lab", greeting, goldenDetails, [
    ["Explore Golden Pass", goldenUrl], ["Get directions", bookingDirections],
  ], welcome) : dayReceipt ? receiptHtml("Your Day Pass is confirmed", greeting, dayDetails, links, overview, calendarFooter) : null;
  const body = golden ? [greeting, welcome, ...goldenDetails, `Explore Golden Pass: ${goldenUrl}`, `Get directions: ${bookingDirections}`].join("\n\n") :
    dayReceipt ? [greeting, overview, ...dayDetails, ...links.map(([label, url]) => `${label}: ${url}`), calendarFooter].filter(Boolean).join("\n\n") :
      [notice.text, ...calendarLinks].join("\n\n");
  const alternative = "armature-body-" + delivery.id;
  const inlineInvite = dayReceipt && notice.events.length === 1;

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
    ...(html ? [`Content-Type: multipart/alternative; boundary="${alternative}"`, "", `--${alternative}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(body),
  ];
  if (html) headers.push(`--${alternative}`, 'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64", "", base64Lines(html));
  for (const [index, event] of notice.events.entries()) {
    const invite = bookingCalendarInvite(event, {
      bookingId: delivery.aggregateId,
      organizer: bookingMailFrom,
      attendee: delivery.recipient,
      sequence: delivery.sequence,
      method,
      sentAt: delivery.createdAt,
    });
    if (inlineInvite) headers.push(
      `--${alternative}`, `Content-Type: text/calendar; charset="UTF-8"; method=${method}`,
      "Content-Transfer-Encoding: base64", "", base64Lines(invite),
    );
    if (html && index === 0) headers.push(`--${alternative}--`);
    headers.push(
      `--${boundary}`,
      `Content-Type: text/calendar; charset="UTF-8"; method=${method}; component=vevent; name="booking-${index + 1}.ics"`,
      `Content-Disposition: attachment; filename="booking-${index + 1}.ics"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(invite),
    );
  }
  if (html && notice.events.length === 0) headers.push(`--${alternative}--`);
  return bytesToBase64Url(new TextEncoder().encode(headers.concat(`--${boundary}--`, "").join("\r\n")));
}
