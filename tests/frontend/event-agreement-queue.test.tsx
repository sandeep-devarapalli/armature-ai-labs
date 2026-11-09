import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventAgreementQueue } from "../../src/components/EventAgreementQueue";
vi.mock("../../src/pages/MemberPages", () => ({ MfaPanel: () => <p>MFA panel</p> }));
vi.mock("../../src/lib/supabase", () => ({ supabase: null }));

const quoteId = "e0000000-0000-4000-8000-000000000002";
const base = { mode: "live", quoteId, date: "2027-03-12", startTime: "10:00", hours: 2, attendees: 20, purpose: "Robotics meetup with demos",
  rentPaise: 500000, amountPaise: 500000, agreementHash: "a".repeat(64), policyVersion: "event-v1", approvedAt: null, preparedAt: null,
  hasAgreement: false, hasOrder: false, orderPending: false, refundDuePaise: null, declineReason: null, status: "awaiting_staff",
  customerEmail: "host@example.test", staffEmail: "staff@example.test" };
const invoke = vi.fn(), getSession = vi.fn(), getAssurance = vi.fn();
const client = { functions: { invoke }, auth: { getSession, mfa: { getAuthenticatorAssuranceLevel: getAssurance } } } as unknown as SupabaseClient;
const auth = { headers: { Authorization: "Bearer synthetic-token" } };
beforeEach(() => { vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: "staff" }, access_token: "synthetic-token" } } });
  getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" } });
  invoke.mockImplementation(async (_name, { body }) => ({ data: body.action === "staff_queue"
    ? { mode: "live", quotes: [{ ...base, memberId: "host" }, { ...base, quoteId: "e0000000-0000-4000-8000-000000000003", date: "2027-04-01", memberId: "staff" }] } : base }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open(status = "awaiting_staff") {
  render(<EventAgreementQueue client={client} actorId="staff" onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByText("Event space requests"));
  fireEvent.click(screen.getByRole("button", { name: "Load event requests" }));
  const review = await screen.findByRole("button", { name: "Review event on 2027-03-12 at 10:00" });
  invoke.mockImplementation(async (_name, { body }) => ({ data: { ...base, status, ...(body.action === "prepare" ? { status: "awaiting_signatures" } : {}) } }));
  fireEvent.click(review);
  await screen.findByRole("region", { name: "Event request review" });
}

it("needs an MFA session before loading requests", async () => {
  getAssurance.mockResolvedValueOnce({ data: { currentLevel: "aal1" } });
  render(<EventAgreementQueue client={client} actorId="staff" onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByText("Event space requests"));
  fireEvent.click(screen.getByRole("button", { name: "Load event requests" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("MFA");
  expect(invoke).not.toHaveBeenCalled();
});

it("lists all requests and blocks reviewing your own", async () => {
  await open();
  expect(invoke).toHaveBeenNthCalledWith(1, "event-checkout", { body: { action: "staff_queue", offset: 0 }, ...auth });
  expect(invoke).toHaveBeenLastCalledWith("event-checkout", { body: { action: "manual_review", memberId: "host", quoteId }, ...auth });
  expect(screen.getByRole("button", { name: "Review event on 2027-04-01 at 10:00" })).toBeDisabled();
  expect(screen.getByText("Customer: host@example.test. Armature signer: staff@example.test.")).toBeInTheDocument();
});

it("prepares the agreement, then asks for the signed PDF", async () => {
  await open();
  expect(screen.queryByRole("button", { name: "Approve event agreement" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("The slot is free and the lab is open that day."));
  fireEvent.click(screen.getByLabelText("I reviewed the event, guest count and purpose with the customer."));
  fireEvent.change(screen.getByLabelText("Setup notes for the agreement"), { target: { value: "Theatre seating, one projector" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and prepare agreement" }));
  await screen.findByRole("button", { name: "Approve event agreement" });
  expect(invoke).toHaveBeenLastCalledWith("event-checkout", { body: { action: "prepare", memberId: "host", quoteId, particulars: {
    availabilityConfirmed: true, eventDetailsReviewed: true, termsVersion: "event-v1", setupNotes: "Theatre seating, one projector" } }, ...auth });
});

it("uploads the signed PDF only when the fingerprint matches", async () => {
  await open("awaiting_signatures");
  const pdf = new File(["%PDF-1.7 specimen"], "signed.pdf", { type: "application/pdf" });
  Object.defineProperty(pdf, "slice", { value: () => ({ text: async () => "%PDF-" }) });
  const NativeFormData = FormData;
  vi.stubGlobal("FormData", class extends NativeFormData { constructor(form?: HTMLFormElement) { super(form); if (form?.querySelector('[name="completedPdf"]')) this.set("completedPdf", pdf); } });
  fireEvent.change(screen.getByLabelText("PandaDoc document ID"), { target: { value: "doc_12345678" } });
  fireEvent.change(screen.getByLabelText("Fingerprint from the signed agreement"), { target: { value: "b".repeat(64) } });
  const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Approve event agreement" }).closest("form")!);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("fingerprint does not match");
  const calls = invoke.mock.calls.length;
  fireEvent.change(screen.getByLabelText("Fingerprint from the signed agreement"), { target: { value: "a".repeat(64) } });
  submit();
  await waitFor(() => expect(invoke.mock.calls.length).toBe(calls + 1));
  vi.unstubAllGlobals();
  const body = invoke.mock.calls.at(-1)![1].body as FormData;
  expect(JSON.parse(String(body.get("metadata")))).toEqual({ action: "approve_manual", memberId: "host", quoteId, documentId: "doc_12345678", agreementHash: "a".repeat(64), confirmed: true });
  expect((body.get("completedPdf") as File).name).toBe("signed.pdf");
});

it("declines an open request with a reason", async () => {
  await open();
  fireEvent.click(screen.getByText("Decline this request"));
  fireEvent.change(screen.getByLabelText("Reason shown to the customer"), { target: { value: "The floor is closed for maintenance" } });
  fireEvent.click(screen.getByRole("button", { name: "Decline request" }));
  await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("event-checkout", { body: { action: "decline", memberId: "host", quoteId, reason: "The floor is closed for maintenance" }, ...auth }));
});
