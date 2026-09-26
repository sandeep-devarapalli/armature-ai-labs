export const bookingAlias = "bookings@armatureailabs.com";
export const primaryUser = "hello@armatureailabs.com";

export interface BookingMail {
  reminderId: string;
  to: string;
  subject: string;
  body: string;
}

export function assertBookingMailIdentity(subject: string, from: string): void {
  if (subject.toLowerCase() !== primaryUser) {
    throw new Error("Google mail must impersonate the primary Workspace user.");
  }
  if (from.toLowerCase() !== bookingAlias) {
    throw new Error("Booking reminders must use the approved bookings alias.");
  }
}

export function isVerifiedBookingAlias(alias: {
  sendAsEmail?: string;
  verificationStatus?: string;
}): boolean {
  return alias.sendAsEmail?.toLowerCase() === bookingAlias &&
    alias.verificationStatus === "accepted";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function bookingMailRaw(mail: BookingMail): string {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(mail.to)) {
    throw new Error("Reminder recipient has an invalid email address.");
  }
  if (!/^[0-9a-f-]{36}$/iu.test(mail.reminderId)) {
    throw new Error("Reminder identifier is invalid.");
  }
  if (/[\r\n]/u.test(mail.subject)) {
    throw new Error("Reminder subject contains a line break.");
  }

  const body = base64Url(new TextEncoder().encode(mail.body))
    .replaceAll("-", "+").replaceAll("_", "/");
  const paddedBody = body.padEnd(Math.ceil(body.length / 4) * 4, "=")
    .replace(/.{1,76}/gu, "$&\r\n");
  const message = [
    `From: Armature AI Labs <${bookingAlias}>`,
    `Reply-To: ${bookingAlias}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    `Message-ID: <armature-reminder-${mail.reminderId}@armatureailabs.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    paddedBody,
  ].join("\r\n");
  return base64Url(new TextEncoder().encode(message));
}
