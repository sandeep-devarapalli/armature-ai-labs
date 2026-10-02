import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EcosystemContributionForm } from "../../src/components/EcosystemContributionForm";
import { EcosystemAdminPage, mergeEcosystemProposal } from "../../src/pages/EcosystemAdminPage";
import { changeEcosystemType, ecosystemEditPending, ecosystemEditPendingMessage, EcosystemEditPendingError, emptyEcosystemListing, getEcosystemListing, getEcosystemSubmissions, rebaseEcosystemSubmission, reviewEcosystemSubmission, submitEcosystemContribution, type EcosystemListing, type EcosystemSubmission } from "../../src/lib/ecosystem";

vi.mock("../../src/lib/ecosystem", async (original) => ({ ...await original<typeof import("../../src/lib/ecosystem")>(), ecosystemEditPending: vi.fn(), getEcosystemSubmissions: vi.fn(), getEcosystemListing: vi.fn(), reviewEcosystemSubmission: vi.fn(), rebaseEcosystemSubmission: vi.fn(), submitEcosystemContribution: vi.fn() }));
const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../../src/context/AppContext", () => ({ useApp: () => auth }));
const listing: EcosystemListing = { slug: "synthetic-workshop", revision: 2, data: { ...emptyEcosystemListing("research-ecosystem"), slug: "synthetic-workshop", name: "Synthetic Workshop", summary: "A synthetic workshop used only for testing.", websiteUrl: "https://example.test", sourceUrl: "https://example.test/about", publicPhones: [{ label: "Reception", number: "+91 9876543210" }], accessNote: "Appointment required", tips: "Bring your project brief" } };
const submission: EcosystemSubmission = { id: "test-receipt", kind: "update", target_slug: listing.slug, base_revision: 2, proposal_revision: 1, base_data: listing.data, proposed: { ...listing.data, summary: "Updated synthetic workshop description." }, submitter_name: "Private test name", submitter_email: "private@example.test", contacts_permission: true, status: "pending", reviewer_notes: null, created_at: "2026-10-02T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks(); auth.isAdmin = true;
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "synthetic-site-key");
  Object.assign(window, { turnstile: { render: vi.fn((_element, options) => { options.callback("synthetic-test-token"); return "widget"; }), remove: vi.fn() } });
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(submitEcosystemContribution).mockResolvedValue("synthetic-receipt");
  vi.mocked(getEcosystemSubmissions).mockResolvedValue([submission]);
  vi.mocked(getEcosystemListing).mockResolvedValue(listing);
  vi.mocked(ecosystemEditPending).mockResolvedValue(false);
});
afterEach(() => { vi.unstubAllEnvs(); });
async function openEdit(value = listing) {
  vi.mocked(getEcosystemListing).mockResolvedValue(value);
  const view = render(<EcosystemContributionForm initialListing={value} onClose={vi.fn()} />);
  await screen.findByLabelText("Organisation, place or resource name *");
  return view;
}

it("prefills public fields and phones but never the private contact or credit", async () => {
  await openEdit();
  expect(screen.getByLabelText("Organisation, place or resource name *")).toHaveValue(listing.data.name);
  expect(screen.getByLabelText("Phone 1")).toHaveValue("+91 9876543210");
  expect(screen.getByLabelText("Access requirements or important caveats")).toHaveValue("Appointment required");
  expect(screen.getByLabelText("Your name")).toHaveValue("");
  expect(screen.getByLabelText(/Credit me publicly/)).not.toBeChecked();
});

it("resets a suggested edit when starting a new listing", async () => {
  const view = await openEdit();
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Private" } });
  view.rerender(<EcosystemContributionForm onClose={vi.fn()} />);
  expect(screen.getByLabelText("Organisation, place or resource name *")).toHaveValue("");
  expect(screen.getByLabelText("Your name")).toHaveValue("");
  expect(screen.queryByLabelText("Phone 1")).not.toBeInTheDocument();
});

it("clears type-specific fields on a type change", () => {
  const changed = changeEcosystemType({ ...listing.data, primaryType: "supplier", minOrder: "10", salesChannel: "Store", founders: "Previous founder" }, "vendor");
  expect(changed.minOrder).toBe(""); expect(changed.salesChannel).toBe(""); expect(changed.founders).toBe("");
});

it("requires permission and persists one receipt after a failed retry without losing the draft", async () => {
  vi.mocked(submitEcosystemContribution).mockRejectedValueOnce(new Error("Synthetic network failure"));
  await openEdit();
  const form = screen.getByRole("button", { name: "Submit for admin review" }).closest("form")!;
  fireEvent.submit(form);
  expect(submitEcosystemContribution).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText(/I have permission/));
  fireEvent.submit(form);
  await screen.findByText("Synthetic network failure");
  await waitFor(() => expect((window as unknown as { turnstile: { render: ReturnType<typeof vi.fn> } }).turnstile.render).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Phone 1")).toHaveValue("+91 9876543210");
  fireEvent.submit(form);
  await screen.findByRole("heading", { name: "Submitted for admin review" });
  expect(vi.mocked(submitEcosystemContribution).mock.calls[0][0].idempotencyKey).toBe(vi.mocked(submitEcosystemContribution).mock.calls[1][0].idempotencyKey);
  expect(screen.getByText("synthetic-receipt")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Submitted for admin review" })).toHaveFocus();
});

it("submits repeatable labelled phones and separate explicitly opted-in credit", async () => {
  await openEdit();
  fireEvent.click(screen.getByRole("button", { name: "Add a phone number" }));
  fireEvent.change(screen.getByLabelText("Phone 2"), { target: { value: "+91 9876543211" } });
  fireEvent.change(screen.getByLabelText("Phone 2 label"), { target: { value: "Workshop" } });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Private Person" } });
  fireEvent.click(screen.getByLabelText(/Credit me publicly/));
  expect(screen.getByLabelText("Public credit name")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Public credit name"), { target: { value: "Public Alias" } });
  fireEvent.click(screen.getByLabelText(/I have permission/));
  fireEvent.submit(screen.getByRole("button", { name: "Submit for admin review" }).closest("form")!);
  await screen.findByText("synthetic-receipt");
  const body = vi.mocked(submitEcosystemContribution).mock.calls[0][0];
  expect(body.proposed.publicPhones).toHaveLength(2);
  expect(body.submitterName).toBe("Private Person"); expect(body.proposed.credit?.name).toBe("Public Alias");
});

it.each(["People", "Housing"])("removes a hidden old pin when switching a pinned listing to %s", async (category) => {
  await openEdit({ ...listing, data: { ...listing.data, coordinates: [77.58, 12.96], locationPrecision: "Locality-level" } });
  fireEvent.change(screen.getByLabelText("Type *"), { target: { value: "other" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: category } });
  fireEvent.click(screen.getByLabelText(/I have permission/));
  fireEvent.submit(screen.getByRole("button", { name: "Submit for admin review" }).closest("form")!);
  await screen.findByText("synthetic-receipt");
  const proposed = vi.mocked(submitEcosystemContribution).mock.calls[0][0].proposed;
  expect(proposed.coordinates).toBeUndefined(); expect(proposed.locationPrecision).toBe("City-level");
});

it.each([true, false])("retains a pin only when the locality is unchanged (changed=%s)", async (changed) => {
  await openEdit({ ...listing, data: { ...listing.data, locality: "Original locality", coordinates: [77.58, 12.96], locationPrecision: "Locality-level" } });
  if (changed) fireEvent.change(screen.getByLabelText("Locality / area (leave blank if unknown)"), { target: { value: "New unconfirmed locality" } });
  fireEvent.click(screen.getByLabelText(/I have permission/));
  fireEvent.submit(screen.getByRole("button", { name: "Submit for admin review" }).closest("form")!);
  await screen.findByText("synthetic-receipt");
  const proposed = vi.mocked(submitEcosystemContribution).mock.calls[0][0].proposed;
  expect(proposed.coordinates).toEqual(changed ? undefined : [77.58, 12.96]);
  expect(proposed.locationPrecision).toBe(changed ? "City-level" : "Locality-level");
});

it("does not fetch the private queue for members or membership-review Staff", () => {
  auth.isAdmin = false; render(<EcosystemAdminPage />);
  expect(screen.getByText("Admin access required")).toBeInTheDocument(); expect(getEcosystemSubmissions).not.toHaveBeenCalled();
});

it("reviews an unchanged revision through the atomic approval RPC", async () => {
  render(<EcosystemAdminPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Workshop/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve and publish" }));
  await waitFor(() => expect(reviewEcosystemSubmission).toHaveBeenCalledWith("test-receipt", "approved", 2, "", 1));
  await screen.findByText(/Approved and published/);
});

it("blocks approval when public contacts lack recorded publication permission", async () => {
  vi.mocked(getEcosystemSubmissions).mockResolvedValue([{ ...submission, contacts_permission: false }]);
  render(<EcosystemAdminPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Workshop/ }));
  expect(await screen.findByRole("button", { name: "Approve and publish" })).toBeDisabled();
  expect(screen.getByText(/Public contacts cannot be approved/)).toBeInTheDocument();
});

it("blocks stale approval until conflict resolution and a separate re-review", async () => {
  vi.mocked(getEcosystemListing).mockResolvedValue({ ...listing, revision: 3, data: { ...listing.data, summary: "Another approved description", accessNote: "New approved access detail" } });
  render(<EcosystemAdminPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Synthetic Workshop/ }));
  const save = await screen.findByRole("button", { name: "Save revised proposal for re-review" });
  expect(save).toBeDisabled(); expect(screen.queryByRole("button", { name: "Approve and publish" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Use proposed value")); fireEvent.click(save);
  await waitFor(() => expect(rebaseEcosystemSubmission).toHaveBeenCalledWith("test-receipt", 3, expect.objectContaining({ summary: submission.proposed.summary, accessNote: "New approved access detail" }), 1));
  expect(reviewEcosystemSubmission).not.toHaveBeenCalled();
});

it("keeps newer unchanged fields while honoring an explicit deletion", () => {
  const proposed = { ...submission, proposed: { ...submission.proposed, publicEmail: "" }, base_data: { ...listing.data, publicEmail: "old@example.test" } };
  const merged = mergeEcosystemProposal(proposed, { ...listing.data, publicEmail: "old@example.test", tips: "New approved tip" }, {});
  expect(merged.tips).toBe("New approved tip"); expect(merged.publicEmail).toBe("");
});

it("does not show an edit form while checking or while any open review is pending", async () => {
  let resolve!: (value: boolean) => void;
  vi.mocked(ecosystemEditPending).mockReturnValue(new Promise(done => { resolve = done; }));
  render(<EcosystemContributionForm initialListing={listing} onClose={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Checking edit availability");
  expect(screen.queryByLabelText("Organisation, place or resource name *")).not.toBeInTheDocument();
  resolve(true);
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(ecosystemEditPendingMessage); expect(alert).toHaveFocus();
  expect(screen.queryByLabelText("Your email")).not.toBeInTheDocument();
  expect(getEcosystemListing).not.toHaveBeenCalled();
});

it("checks again after a release and prefills the newest published listing", async () => {
  vi.mocked(ecosystemEditPending).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  vi.mocked(getEcosystemListing).mockResolvedValue({ ...listing, revision: 3, data: { ...listing.data, summary: "Newest approved workshop description" } });
  render(<EcosystemContributionForm initialListing={listing} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
  expect(await screen.findByLabelText("What does it build or offer? *")).toHaveValue("Newest approved workshop description");
  expect(getEcosystemListing).toHaveBeenCalledWith(listing.slug, true);
});

it("fails closed on a status error and retries without assuming no pending edit", async () => {
  vi.mocked(ecosystemEditPending).mockRejectedValueOnce(new Error("Status temporarily unavailable"));
  render(<EcosystemContributionForm initialListing={listing} onClose={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Status temporarily unavailable");
  expect(screen.queryByLabelText("Organisation, place or resource name *")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry status check" }));
  expect(await screen.findByLabelText("Organisation, place or resource name *")).toHaveValue(listing.data.name);
});

it("fails closed if the current listing is no longer public", async () => {
  vi.mocked(getEcosystemListing).mockResolvedValue(null);
  render(<EcosystemContributionForm initialListing={listing} onClose={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("This listing is no longer available for editing");
  expect(screen.queryByLabelText("Organisation, place or resource name *")).not.toBeInTheDocument();
});

it("rechecks each edit opening while new submissions remain unaffected", async () => {
  vi.mocked(ecosystemEditPending).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const first = await openEdit(); first.unmount();
  const second = render(<EcosystemContributionForm initialListing={listing} onClose={vi.fn()} />);
  await screen.findByText(ecosystemEditPendingMessage); second.unmount();
  render(<EcosystemContributionForm onClose={vi.fn()} />);
  expect(screen.getByLabelText("Organisation, place or resource name *")).toHaveValue("");
  expect(ecosystemEditPending).toHaveBeenCalledTimes(2);
});

it("preserves a racing edit draft and its receipt key until a pending review is released", async () => {
  vi.mocked(submitEcosystemContribution).mockRejectedValueOnce(new EcosystemEditPendingError());
  await openEdit();
  fireEvent.change(screen.getByLabelText("What does it build or offer? *"), { target: { value: "My unsent correction remains intact" } });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Private draft name" } });
  fireEvent.click(screen.getByLabelText(/I have permission/));
  fireEvent.submit(screen.getByRole("button", { name: "Submit for admin review" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(ecosystemEditPendingMessage);
  expect(screen.queryByRole("button", { name: "Submit for admin review" })).not.toBeInTheDocument();
  expect(screen.queryByText("synthetic-receipt")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await screen.findByRole("button", { name: "Submit for admin review" });
  expect(screen.getByLabelText("Your name")).toHaveValue("Private draft name");
  expect(screen.getByLabelText("What does it build or offer? *")).toHaveValue("My unsent correction remains intact");
  await waitFor(() => expect((window as unknown as { turnstile: { render: ReturnType<typeof vi.fn> } }).turnstile.render).toHaveBeenCalledTimes(3));
  fireEvent.submit(screen.getByRole("button", { name: "Submit for admin review" }).closest("form")!);
  await screen.findByText("synthetic-receipt");
  const calls = vi.mocked(submitEcosystemContribution).mock.calls;
  expect(calls[1][0].idempotencyKey).toBe(calls[0][0].idempotencyKey);
  expect(calls[1][0].baseRevision).toBe(2);
});
