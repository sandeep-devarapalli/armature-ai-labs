import { expect, it } from "vitest";
import {
  assertBookingMailIdentity,
  bookingMailRaw,
  isVerifiedBookingAlias,
} from "../../supabase/functions/_shared/booking-mail";

const mail = {
  reminderId: "12345678-1234-1234-1234-123456789abc",
  to: "member@example.com",
  subject: "Your Armature booking starts tomorrow",
  body: "Instrument: caméra\nTime: 10:00",
};

it("encodes UTF-8 reminder content with the approved From and Reply-To", () => {
  const mime = new TextDecoder().decode(
    Uint8Array.from(
      atob(bookingMailRaw(mail).replaceAll("-", "+").replaceAll("_", "/")),
      (character) => character.charCodeAt(0),
    ),
  );
  expect(mime).toContain("From: Armature AI Labs <bookings@armatureailabs.com>");
  expect(mime).toContain("Reply-To: bookings@armatureailabs.com");
  expect(mime).toContain("Message-ID: <armature-reminder-12345678-1234-1234-1234-123456789abc@armatureailabs.com>");
  const body = mime.split("\r\n\r\n")[1].replaceAll("\r\n", "");
  expect(new TextDecoder().decode(Uint8Array.from(atob(body), (character) => character.charCodeAt(0))))
    .toBe(mail.body);
});

it("rejects header injection in recipient and subject", () => {
  expect(() => bookingMailRaw({ ...mail, to: "member@example.com\r\nBcc: other@example.com" }))
    .toThrow("invalid email");
  expect(() => bookingMailRaw({ ...mail, subject: "Reminder\r\nBcc: other@example.com" }))
    .toThrow("line break");
});

it("accepts only the primary Workspace identity and verified bookings alias", () => {
  expect(() => assertBookingMailIdentity(
    "hello@armatureailabs.com",
    "bookings@armatureailabs.com",
  )).not.toThrow();
  expect(() => assertBookingMailIdentity(
    "bookings@armatureailabs.com",
    "bookings@armatureailabs.com",
  )).toThrow("primary Workspace user");
  expect(isVerifiedBookingAlias({
    sendAsEmail: "bookings@armatureailabs.com",
    verificationStatus: "pending",
  })).toBe(false);
  expect(isVerifiedBookingAlias({
    sendAsEmail: "bookings@armatureailabs.com",
    verificationStatus: "accepted",
  })).toBe(true);
});
