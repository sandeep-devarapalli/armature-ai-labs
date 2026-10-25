import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PhoneVerification } from "../../src/components/PhoneVerification";
const empty = { available_channels: ["sms"], enabled: true, verified: false, masked_phone: null, channel: null, expires_at: null, resend_available_at: null };
const pending = { ...empty, masked_phone: "+91••••••1234", channel: "sms", expires_at: new Date(Date.now() + 300000).toISOString(), resend_available_at: new Date(Date.now() + 60000).toISOString() };
function setup(responses: unknown[] = [empty], props: { initialPhone?: string; userId?: string; onVerified?: () => void } = {}) {
  const invoke = vi.fn(); responses.forEach(data => invoke.mockResolvedValueOnce({ data, error: null }));
  const result = render(<PhoneVerification client={{ functions: { invoke } } as unknown as SupabaseClient} {...props} />);
  return { invoke, ...result };
}
it("starts SMS first, requires code and refreshes account after confirmation", async () => {
  const { invoke } = setup([empty, pending, { ...empty, verified: true, masked_phone: pending.masked_phone }]);
  const update = vi.fn(); window.addEventListener("armature:account-changed", update);
  fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "9999991234" } });
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
  fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "9999991234" } });
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
  expect(await screen.findByLabelText("Country code")).toHaveValue("IN");
  expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Use WhatsApp instead" })).not.toBeInTheDocument();
});
it("does not offer delivery or number changes when the server has no available channels", async () => {
  setup([{ ...empty, available_channels: [], verified: true, masked_phone: pending.masked_phone }]);
  await screen.findByText(/Mobile verification is not available yet/);
  expect(screen.getByText(/Mobile verified/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Send SMS|WhatsApp|Change mobile/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();
});


it.each(["9999991234", "+91 99999 91234"])("reuses saved number %s without sending until requested", async initialPhone => {
  const { invoke } = setup([empty, pending], { initialPhone });
  await screen.findByText("Mobile number from your details");
  expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();
  expect(invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Send SMS code" }));
  await screen.findByText(/Code sent by SMS/);
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "start", phone: "+919999991234", channel: "sms" } });
});

it("edits an international saved number with country selection without sending automatically", async () => {
  const { invoke } = setup([empty], { initialPhone: "+44 7700 900123" });
  await screen.findByText("Mobile number from your details");
  fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
  expect(screen.getByLabelText("Country code")).toHaveValue("GB");
  expect(screen.getByLabelText("Mobile number").getAttribute("value")?.replace(/\D/g, "")).toBe("7700900123");
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("refreshes parent details only after server-confirmed verification", async () => {
  const onVerified = vi.fn();
  const { invoke } = setup([empty, pending, { ...empty, verified: true, masked_phone: pending.masked_phone }], { initialPhone: "9999991234", onVerified });
  fireEvent.click(await screen.findByRole("button", { name: "Send SMS code" }));
  await screen.findByLabelText("Verification code");
  expect(onVerified).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify mobile number" }));
  await waitFor(() => expect(onVerified).toHaveBeenCalledOnce());
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "verify", code: "123456" } });
});

it("keeps a restored pending OTP tied to its masked destination", async () => {
  const { invoke } = setup([pending], { initialPhone: "+447700900123" });
  await screen.findByText(/Code sent by SMS to \+91••••••1234/);
  expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Mobile number from your details")).not.toBeInTheDocument();
});

it("clears pending code and number state when the account changes", async () => {
  const invoke = vi.fn().mockResolvedValueOnce({ data: pending, error: null }).mockResolvedValueOnce({ data: empty, error: null });
  let account = "first";
  const getSession = vi.fn(async () => ({ data: { session: { user: { id: account }, access_token: `${account}-token` } }, error: null }));
  const client = { functions: { invoke }, auth: { getSession } } as unknown as SupabaseClient;
  const { rerender } = render(<PhoneVerification client={client} userId="first" initialPhone="9999991234" />);
  fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "123456" } });
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "status" }, headers: { Authorization: "Bearer first-token" } });
  account = "second";
  rerender(<PhoneVerification client={client} userId="second" initialPhone="" />);
  await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Mobile number")).toHaveValue("");
  expect(screen.queryByText(/••••••1234/)).not.toBeInTheDocument();
  expect(invoke).toHaveBeenLastCalledWith("member-phone-verification", { body: { action: "status" }, headers: { Authorization: "Bearer second-token" } });
});

it("waits for the server resend boundary and expires OTP entry at five minutes", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  try {
    setup([empty, { ...pending, expires_at: new Date(now + 300000).toISOString(), resend_available_at: new Date(now + 60000).toISOString() }], { initialPhone: "9999991234" });
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Send SMS code" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(59000); });
    expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(screen.getByRole("button", { name: "Send SMS code" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    expect(screen.getByRole("button", { name: "Verify mobile number" })).toBeEnabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(240000); });
    expect(screen.getByRole("button", { name: "Verify mobile number" })).toBeDisabled();
    expect(screen.getByText(/This code has expired/)).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it("rejects a stale authenticated account before sending any SMS", async () => {
  let account = "first";
  const invoke = vi.fn().mockResolvedValue({ data: empty, error: null });
  const getSession = vi.fn(async () => ({ data: { session: { user: { id: account }, access_token: `${account}-token` } }, error: null }));
  const client = { functions: { invoke }, auth: { getSession } } as unknown as SupabaseClient;
  render(<PhoneVerification client={client} userId="first" initialPhone="9999991234" />);
  await screen.findByText("Mobile number from your details");
  account = "second";
  fireEvent.click(screen.getByRole("button", { name: "Send SMS code" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your account changed");
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("keeps confirmed verification when parent refresh fails and allows cancellation of an unsent change", async () => {
  const onVerified = vi.fn().mockRejectedValue(new Error("refresh failed"));
  const { invoke } = setup([pending, { ...empty, verified: true, masked_phone: pending.masked_phone }], { initialPhone: "9999991234", onVerified });
  fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify mobile number" }));
  await screen.findByText(/Mobile verified/);
  fireEvent.click(screen.getByRole("button", { name: "Change mobile number" }));
  expect(screen.getByLabelText("Mobile number")).toHaveValue("");
  expect(screen.getByLabelText("Country code")).toHaveValue("IN");
  expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();
  expect(screen.getByText(/Mobile verified/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("discards the old resend destination when a status refresh returns a different challenge", async () => {
  const otherPending = { ...pending, masked_phone: "+44••••••0123", resend_available_at: new Date(Date.now() - 1000).toISOString() };
  const { invoke } = setup([empty, pending, { error: "Provider details", code: "verification_changed" }, otherPending], { initialPhone: "9999991234" });
  fireEvent.click(await screen.findByRole("button", { name: "Send SMS code" }));
  fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify mobile number" }));
  fireEvent.click(await screen.findByRole("button", { name: "Refresh mobile verification" }));
  await screen.findByText(/Code sent by SMS to \+44••••••0123/);
  expect(screen.getByLabelText("Verification code")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  expect(screen.getByText("To send another code, confirm the mobile number first.")).toBeInTheDocument();
  expect(invoke.mock.calls.filter(([, options]) => options.body.action === "start")).toHaveLength(1);
});
