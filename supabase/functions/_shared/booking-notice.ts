import { legalEntity } from "../../../src/data/legalEntity.ts";

const labName = "Armature AI Labs";
const address = legalEntity.labAddress.formatted;
const directions = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(address);
export const bookingTimeZone = "Asia/Kolkata";

export type BookingSession = { id: string; startsAt: string; endsAt: string };
type BookingNotice = {
  kind: "day" | "week" | "month" | "guest" | "cabin" | "equipment";
  reference: string;
  stage: "received" | "alternate" | "signing" | "payment_due" | "deposit_verified" | "confirmed" | "updated" | "cancelled" | "declined";
  sessions?: BookingSession[];
  guestDate?: string;
  resource?: string;
};

const titles = {
  day: "Day Pass", week: "Week Pass", month: "Month Pass", guest: "Guest Pass",
  cabin: "Cabin Booking", equipment: "Equipment Booking",
};
const stages = {
  received: "Request received", alternate: "Alternate date offered", signing: "Agreement ready", payment_due: "Payment instructions available",
  deposit_verified: "Deposit verified", confirmed: "Confirmed", updated: "Schedule updated", cancelled: "Cancelled", declined: "Request declined",
};
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: bookingTimeZone, weekday: "short", dateStyle: undefined, day: "numeric",
  month: "short", year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: bookingTimeZone, hour: "numeric", minute: "2-digit", hour12: true,
});

export function guestPassSession(day: string): BookingSession {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) {
    throw new Error("Invalid Guest Pass date");
  }
  return { id: "visit", startsAt: day + "T09:00:00+05:30", endsAt: day + "T17:00:00+05:30" };
}

export function bookingNotice(input: BookingNotice) {
  const title = titles[input.kind];
  const overview = input.kind === "guest" && ["confirmed", "updated"].includes(input.stage)
    ? "This free Guest Pass is for your meeting or event during standard lab hours. It does not reserve a desk or seat."
    : {
      received: "We’ve received your request. Check the booking page for its status.",
      alternate: "Armature has proposed a different visit date. Open Bookings to review the offer.",
      signing: "Open the booking page to review your agreement and the next steps.",
      payment_due: "Open the booking page to review payment instructions. Access starts after the booking is confirmed.",
      deposit_verified: "Armature verified your security deposit. Open Bookings to check your rent and booking status.",
      confirmed: "Your booking is confirmed.",
      updated: "Your booking schedule has changed.",
      cancelled: "Your booking has been cancelled.",
      declined: "Your request was declined. Check the booking page for details.",
    }[input.stage];
  const scheduleStage = ["confirmed", "updated", "cancelled"].includes(input.stage);
  const sessions = scheduleStage
    ? input.sessions ?? (input.kind === "guest" && input.guestDate ? [guestPassSession(input.guestDate)] : [])
    : [];
  for (const session of sessions) {
    const start = Date.parse(session.startsAt), end = Date.parse(session.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Invalid booking session");
  }
  const schedule = sessions.map(({ startsAt, endsAt }) => {
    const start = new Date(startsAt), end = new Date(endsAt);
    const startDay = dateFormat.format(start), endDay = dateFormat.format(end);
    return startDay === endDay
      ? `${startDay}, ${timeFormat.format(start)}–${timeFormat.format(end)} IST`
      : `${startDay}, ${timeFormat.format(start)} IST to ${endDay}, ${timeFormat.format(end)} IST`;
  });
  const url = new URL("https://armatureailabs.com/bookings/");
  url.searchParams.set("item", input.kind === "guest" ? "guest" : input.kind === "cabin"
    ? "cabin" : input.kind === "equipment" ? "kit" : "desk");
  url.hash = "steps";
  return {
    subject: `${title} · ${stages[input.stage]} · ${labName}`,
    text: [overview, `Reference: ${input.reference}`, input.resource && `Resource: ${input.resource}`, ...schedule,
      `${labName}, ${address}`, `Google Maps directions: ${directions}`, `Booking page: ${url}`]
      .filter(Boolean).join("\n"),
    events: sessions.map(session => ({
      ...session, summary: `${title}${input.resource ? ` · ${input.resource}` : ""} · ${labName}`,
      location: `${labName}, ${address}`,
      description: [overview, `Reference: ${input.reference}`, `Google Maps directions: ${directions}`, `Booking page: ${url}`].join("\n"),
    })),
  };
}

export type BookingCalendarEvent = ReturnType<typeof bookingNotice>["events"][number];
const escapeText = (value: string) => value.replaceAll("\\", "\\\\").replace(/\r\n|\r|\n/g, "\\n")
  .replaceAll(",", "\\,").replaceAll(";", "\\;");
const icsDate = (value: string) => new Date(value).toISOString().replace(/-|:|\.\d{3}/g, "");

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const lines = [""];
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { lines.push(" "); bytes = 1; }
    lines[lines.length - 1] += char;
    bytes += size;
  }
  return lines.join("\r\n");
}

export function bookingCalendarInvite(event: BookingCalendarEvent, options: {
  bookingId: string;
  organizer: string;
  attendee: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  sentAt: string;
}): string {
  const { bookingId, organizer, attendee, sequence, method, sentAt } = options;
  if (![bookingId, event.id].every(value => /^[a-z0-9-]+$/i.test(value)) ||
    ![organizer, attendee].every(value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) ||
    !Number.isSafeInteger(sequence) || sequence < 0) throw new Error("Invalid calendar invite identity");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Armature AI Labs//Booking//EN",
    `METHOD:${method}`, "BEGIN:VEVENT", `UID:${bookingId}.${event.id}@armatureailabs.com`,
    `SEQUENCE:${sequence}`, `DTSTAMP:${icsDate(sentAt)}`,
    `DTSTART:${icsDate(event.startsAt)}`, `DTEND:${icsDate(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`, `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(event.description)}`, `ORGANIZER:mailto:${organizer}`,
    `ATTENDEE;RSVP=${method === "REQUEST" ? "TRUE" : "FALSE"}:mailto:${attendee}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE",
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(foldLine).join("\r\n");
}
