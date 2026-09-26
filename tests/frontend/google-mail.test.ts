import { afterEach, expect, it, vi } from "vitest";
import {
  assertBookingMailIdentity,
  bookingMailRaw,
  isVerifiedBookingAlias,
} from "../../supabase/functions/_shared/booking-mail";

vi.mock("../../supabase/functions/_shared/env.ts", () => ({
  requiredEnv: () => "hello@armatureailabs.com",
}));
vi.mock("../../supabase/functions/_shared/google.ts", () => ({
  googleAccessToken: () => Promise.resolve("mock-token"),
}));

afterEach(() => vi.unstubAllGlobals());

const mail = {
  reminderId: "12345678-1234-1234-1234-123456789abc",
  to: "member@example.com",
  subject: "Your Armature booking starts tomorrow",
  body: "Instrument: caméra\nTime: 10:00",
};

const loadGoogleMail = () => import("../../supabase/functions/_shared/" + "google-mail.ts") as Promise<{
  sendBookingMail: (value: typeof mail) => Promise<void>;
}>;

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

it("refuses Gmail delivery until Send mail as is accepted", async () => {
  const { sendBookingMail } = await loadGoogleMail();
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ sendAsEmail: "bookings@armatureailabs.com", verificationStatus: "pending" }),
  });
  vi.stubGlobal("fetch", fetch);

  await expect(sendBookingMail(mail)).rejects.toThrow("not verified");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("sends the encoded reminder only after checking the accepted alias", async () => {
  const { sendBookingMail } = await loadGoogleMail();
  vi.stubGlobal("Deno", { env: { get: () => undefined } });
  const fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sendAsEmail: "bookings@armatureailabs.com", verificationStatus: "accepted" }),
    })
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("fetch", fetch);

  await sendBookingMail(mail);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: "POST",
    headers: { authorization: "Bearer mock-token" },
    body: JSON.stringify({ raw: bookingMailRaw(mail) }),
  });
});
