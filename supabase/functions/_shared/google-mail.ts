import {
  assertBookingMailIdentity,
  bookingAlias,
  bookingMailRaw,
  type BookingMail,
  isVerifiedBookingAlias,
} from "./booking-mail.ts";
import { requiredEnv } from "./env.ts";
import { googleAccessToken } from "./google.ts";

const gmailScopes = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
].join(" ");

export async function sendBookingMail(mail: BookingMail): Promise<void> {
  assertBookingMailIdentity(
    requiredEnv("GOOGLE_WORKSPACE_SUBJECT"),
    Deno.env.get("REMINDER_FROM") ?? bookingAlias,
  );

  const token = await googleAccessToken(gmailScopes);
  const sendAs = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${bookingAlias}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!sendAs.ok) {
    throw new Error(`Google send-as lookup failed (${sendAs.status}).`);
  }
  const alias = await sendAs.json() as {
    sendAsEmail?: string;
    verificationStatus?: string;
  };
  if (!isVerifiedBookingAlias(alias)) {
    throw new Error("The bookings alias is not verified for Gmail sending.");
  }

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: bookingMailRaw(mail) }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gmail reminder send failed (${response.status}).`);
  }
}
