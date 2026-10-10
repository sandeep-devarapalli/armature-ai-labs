import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PhoneVerification } from "../../src/components/PhoneVerification";
const empty = { available_channels: ["sms"], enabled: true, verified: false, masked_phone: null, channel: null, expires_at: null, resend_available_at: null };
const pending = { ...empty, masked_phone: "+91••••••1234", channel: "sms", expires_at: new Date(Date.now() + 300000).toISOString(), resend_available_at: new Date(Date.now() + 60000).toISOString() };
function setup(responses: unknown[] = [empty]) {
  const invoke = vi.fn(); responses.forEach(data => invoke.mockResolvedValueOnce({ data, error: null }));
  const result = render(<PhoneVerification client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  return { invoke, ...result };
}
it("starts SMS first, requires code and refreshes account after confirmation", async () => {
  const { invoke } = setup([empty, pending, { ...empty, verified: true, masked_phone: pending.masked_phone }]);
  const update = vi.fn(); window.addEventListener("armature:account-changed", update);
  fireEvent.change(await screen.findByLabelText("Mobile number with country code"), { target: { value: "+919999991234" } });
  fireEvent.click(screen.getByRole("button", { name: "Send SMS code" }));
  await screen.findByText(/Code sent by SMS/);
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "start", phone: "+919999991234", channel: "sms" } });
  expect(screen.queryByRole("button", { name: "Use WhatsApp instead" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verify mobile number" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify mobile number" }));
  await screen.findByText(/Mobile verified/);
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "verify", code: "123456" } });
  expect(update).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
  window.removeEventListener("armature:account-changed", update);
});
it("offers WhatsApp only when the server enables it, without automatically sending", async () => {
  const { invoke } = setup([{ ...empty, available_channels: ["sms", "whatsapp"] }, { ...pending, available_channels: ["sms", "whatsapp"], channel: "whatsapp" }]);
  fireEvent.change(await screen.findByLabelText("Mobile number with country code"), { target: { value: "+919999991234" } });
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Send SMS code" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Use WhatsApp instead" }));
  await screen.findByText(/Code sent by WhatsApp/);
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "start", phone: "+919999991234", channel: "whatsapp" } });
  expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Use WhatsApp instead" })).toBeDisabled();
});
it("fails closed when disabled and when a pending code expires", async () => {
  const { unmount } = setup([{ ...empty, enabled: false }]);
  await screen.findByText(/Mobile verification is not available yet/);
  expect(screen.queryByRole("button", { name: "Send SMS code" })).not.toBeInTheDocument();
  unmount(); setup([{ ...pending, expires_at: new Date(Date.now() - 1000).toISOString() }]);
  await screen.findByText(/This code has expired/);
  expect(screen.getByRole("button", { name: "Verify mobile number" })).toBeDisabled();
});
it("renders safe provider errors and does not claim verification", async () => {
  const { invoke } = setup([pending]);
  await screen.findByLabelText("Verification code");
  invoke.mockResolvedValueOnce({ data: { error: "private upstream details", code: "invalid_code" }, error: null });
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "111111" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify mobile number" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("That code is invalid or expired");
  expect(screen.queryByText(/private upstream/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Mobile verified/)).not.toBeInTheDocument();
});
it("discards an old response after account component unmount", async () => {
  let finish!: (value: unknown) => void;
  const invoke = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const { unmount } = render(<PhoneVerification client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  await waitFor(() => expect(invoke).toHaveBeenCalledOnce()); unmount();
  await act(async () => finish({ data: { ...empty, verified: true }, error: null }));
  expect(screen.queryByText(/Mobile verified/)).not.toBeInTheDocument();
});

it("uses SMS alone for an enabled older backend without channel metadata", async () => {
  const { available_channels, ...legacy } = empty;
  setup([legacy]);
  expect(await screen.findByRole("button", { name: "Send SMS code" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Use WhatsApp instead" })).not.toBeInTheDocument();
});
it("does not offer delivery or number changes when the server has no available channels", async () => {
  setup([{ ...empty, available_channels: [], verified: true, masked_phone: pending.masked_phone }]);
  await screen.findByText(/Mobile verification is not available yet/);
  expect(screen.getByText(/Mobile verified/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Send SMS|WhatsApp|Change mobile/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Mobile number with country code")).not.toBeInTheDocument();
});
