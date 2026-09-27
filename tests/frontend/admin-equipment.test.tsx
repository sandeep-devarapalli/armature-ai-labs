import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ role: "admin" as string | null, rpc: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: mock.role ? { user_id: "admin", role: mock.role } : null, loading: false }) }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { rpc: mock.rpc, from: () => ({ select: () => ({ in: async () => ({ data: [{ id: "day", name: "Day pass", tax_bps: null }], error: null }) }) }) } }));
import { AdminEquipmentPage } from "../../src/pages/AdminEquipmentPage";
const snapshot = { units: [{ id: "unit", name: "Printer 01", asset_tag: "ARM-P2S-000001", resource_id: "resource", asset_unit_id: "asset", component_slug: "bambu-lab-p2s", commissioned: true, maintenance: false, kit_contents: [], inventory_location_id: "location", location_name: "Recorded bench", lab_location_id: "lab", rates: [{ id: "rate", charge_unit: "hour", price_paise: 20000, tax_bps: 1800, valid_from: "2026-01-01T00:00:00Z", valid_until: null }] }], assets: [{ id: "asset", asset_tag: "ARM-P2S-000001", component_slug: "bambu-lab-p2s", status: "available" }], resources: [{ id: "resource", name: "Printer 01", location_id: "lab" }], locations: [{ id: "location", name: "Recorded bench", lab_location_id: "lab" }] };
beforeEach(() => { mock.role = "admin"; mock.rpc.mockReset(); mock.rpc.mockImplementation(async name => ({ data: name === "admin_list_equipment_operations" ? snapshot : null, error: null })); vi.spyOn(window, "confirm").mockReturnValue(true); });
async function selectUnit() { render(<AdminEquipmentPage />); fireEvent.click(await screen.findByRole("button", { name: /Printer 01/ })); }
it.each([null, "member", "membership_reviewer"])("blocks %s before reading inventory", role => {
  mock.role = role; render(<AdminEquipmentPage />);
  expect(screen.getByRole("heading", { name: "Admin access required" })).toBeVisible(); expect(mock.rpc).not.toHaveBeenCalled();
});
it("requires confirmation and sends kit/location/maintenance through the audited RPC", async () => {
  await selectUnit(); fireEvent.click(screen.getByLabelText("Maintenance: prevent new rentals"));
  fireEvent.click(screen.getByRole("button", { name: "Add kit item" }));
  fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "Build plate" } });
  fireEvent.change(screen.getByLabelText("Unit update reason"), { target: { value: "Scheduled inspection" } });
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Review unit update" }));
  expect(mock.rpc).not.toHaveBeenCalledWith("admin_update_equipment_unit", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "Review unit update" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("admin_update_equipment_unit", { p_unit_id: "unit", p_inventory_location_id: "location", p_kit_contents: [{ name: "Build plate", quantity: 1 }], p_maintenance: true, p_note: "Scheduled inspection" }));
});
it("submits explicit tax and IST effective time for a referenced rate version", async () => {
  await selectUnit();
  fireEvent.change(screen.getByLabelText("Previous rate version"), { target: { value: "rate" } });
  fireEvent.change(screen.getByLabelText("Price before tax · INR"), { target: { value: "250" } });
  fireEvent.change(screen.getByLabelText("Approved tax · percent"), { target: { value: "18" } });
  fireEvent.change(screen.getByLabelText("Effective from · IST"), { target: { value: "2030-01-01T09:00" } });
  fireEvent.change(screen.getByLabelText("Rate approval reason"), { target: { value: "Approved revised price" } });
  fireEvent.click(screen.getByRole("button", { name: "Review rate approval" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("admin_replace_equipment_rate", { p_current_rate_id: "rate", p_price_paise: 25000, p_tax_bps: 1800, p_effective_from: "2030-01-01T03:30:00.000Z", p_valid_until: null, p_reason: "Approved revised price" }));
});
it("shows unknown workspace tax and changes it only through the protected action", async () => {
  render(<AdminEquipmentPage />); await screen.findByRole("option", { name: "Day pass · Tax unconfigured" });
  fireEvent.change(screen.getByLabelText("Workspace product"), { target: { value: "day" } });
  fireEvent.change(screen.getByLabelText("Workspace tax · percent"), { target: { value: "18" } });
  fireEvent.change(screen.getByLabelText("Workspace tax reason"), { target: { value: "Approved tax treatment" } });
  fireEvent.click(screen.getByRole("button", { name: "Review workspace tax" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("configure_workspace_tax", { p_product_id: "day", p_tax_bps: 1800, p_reason: "Approved tax treatment" }));
});
