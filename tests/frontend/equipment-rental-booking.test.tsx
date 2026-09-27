import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), payment: "unpaid", status: "approved" }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: { user_id: "member", status: mock.status } }) }));
vi.mock("../../src/context/AppContext", () => ({ useApp: () => ({ teamAccess: [{ organizationId: "team", organizationName: "Robotics team", role: "admin", membershipActive: true, seatEnabled: true }] }) }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { rpc: mock.rpc, from: () => {
  const query = { select: () => query, eq: () => query, is: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    single: async () => ({ data: { id: "quote", amount_paise: 20000, tax_paise: 3600, total_paise: 23600, expires_at: "2026-11-18T04:00:00Z", payment_state: mock.payment }, error: null }) };
  return query;
} } }));
vi.mock("../../src/components/BookingFloorMap", () => ({ BookingFloorMap: () => null }));
import { EquipmentRentalBooking } from "../../src/components/EquipmentRentalBooking";
beforeEach(() => {
  mock.payment = "unpaid"; mock.status = "approved"; mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name: string, args: { p_organization_id?: string } = {}) => ({ data: name === "get_equipment_rental_options" ? [{ component_slug: "bambu-lab-p2s", unit_id: "unit", rate_id: "rate", name: "Printer 01", charge_unit: "hour", price_paise: 20000, tax_bps: 1800 }] : name === "get_equipment_workspace_coverage" ? [{ id: "workspace-booking", name: args.p_organization_id ? "C01 whole cabin · booked by team admin" : "S01 chair", starts_at: "2026-11-18T03:30:00Z" }] : name === "get_equipment_rental_extensions" ? [{ id: "previous-order", ends_at: "2026-11-18T03:30:00Z" }] : name === "list_team_roster" ? [{ user_id: "operator", display_name: "Team builder", seat_enabled: true }] : name === "create_equipment_rental_quote" ? "quote" : "order", error: null }));
});
function show() { render(<MemoryRouter><EquipmentRentalBooking slug="bambu-lab-p2s" /></MemoryRouter>); }
async function quote() {
  show(); await screen.findByRole("option", { name: /Printer 01/ });
  fireEvent.change(screen.getByLabelText("Commissioned unit"), { target: { value: "rate" } });
  fireEvent.change(screen.getByLabelText("First date · IST"), { target: { value: "2026-11-18" } });
  fireEvent.click(screen.getByLabelText(/S01 chair/));
  fireEvent.click(screen.getByRole("button", { name: "Get equipment quote" }));
  await screen.findByText(/Awaiting local Admin/);
}
it("requires approved basic membership before fetching protected units", () => {
  mock.status = "pending"; show();
  expect(screen.getByText(/Approved basic membership/)).toBeVisible(); expect(mock.rpc).not.toHaveBeenCalled();
});
it("requires server mock authorization and itemizes the quote", async () => {
  await quote();
  expect(screen.getByText(/Equipment: ₹200.00 · Tax: ₹36.00 · Total: ₹236.00/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Reserve with authorized test receipt" })).toBeDisabled();
  expect(mock.rpc).toHaveBeenCalledWith("create_equipment_rental_quote", expect.objectContaining({ p_starts_at: "2026-11-18T03:30:00.000Z", p_ends_at: "2026-11-18T04:30:00.000Z" }));
  mock.payment = "authorized";
  fireEvent.click(screen.getByRole("button", { name: "Refresh authorization" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reserve with authorized test receipt" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Reserve with authorized test receipt" }));
  await screen.findByRole("status");
  expect(mock.rpc).toHaveBeenCalledWith("reserve_equipment_rental", expect.objectContaining({ p_quote_id: "quote", p_workspace_booking_ids: ["workspace-booking"] }));
  expect(mock.rpc).not.toHaveBeenCalledWith("authorize_mock_equipment_payment", expect.anything());
});
it("invalidates an existing quote when the member changes dates", async () => {
  await quote(); fireEvent.change(screen.getByLabelText("First date · IST"), { target: { value: "2026-11-19" } });
  expect(screen.queryByRole("button", { name: "Reserve with authorized test receipt" })).not.toBeInTheDocument();
});

it("resets account coverage and sends the actual team operator in a fresh quote", async () => {
  await quote();
  fireEvent.change(screen.getByLabelText("Booking account"), { target: { value: "team" } });
  expect(screen.queryByRole("button", { name: "Reserve with authorized test receipt" })).not.toBeInTheDocument();
  await screen.findByRole("option", { name: "Team builder" });
  fireEvent.change(screen.getByLabelText("Equipment operator"), { target: { value: "operator" } });
  await screen.findByLabelText(/C01 whole cabin/);
  expect(screen.getByLabelText(/C01 whole cabin/)).not.toBeChecked();
  fireEvent.click(screen.getByLabelText(/C01 whole cabin/));
  fireEvent.click(screen.getByRole("button", { name: "Get equipment quote" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenLastCalledWith("create_equipment_rental_quote", expect.objectContaining({ p_operator_id: "operator", p_organization_id: "team" })));
});

it("requests owned same-unit extensions and passes the parent without changing it", async () => {
  await quote();
  await screen.findByRole("option", { name: /previous-order/ });
  fireEvent.change(screen.getByLabelText("Existing rental to extend"), { target: { value: "previous-order" } });
  fireEvent.click(screen.getByRole("button", { name: "Get equipment quote" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenLastCalledWith("create_equipment_rental_quote", expect.objectContaining({ p_parent_order_id: "previous-order" })));
  expect(mock.rpc).toHaveBeenCalledWith("get_equipment_rental_extensions", { p_unit_id: "unit", p_operator_id: "member", p_organization_id: null });
});
