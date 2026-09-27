import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ userId: "operator", active: false, rpc: vi.fn(), create: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: { user_id: mock.userId } }) }));
vi.mock("../../src/context/AppContext", () => ({ useApp: () => ({ online: true, createCheckinIntent: mock.create }) }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,AA==" } }));
import { DailyEquipmentAccess } from "../../src/components/DailyEquipmentAccess";
beforeEach(() => {
  mock.userId = "operator"; mock.active = false; mock.rpc.mockReset(); mock.create.mockReset();
  mock.rpc.mockImplementation(async () => ({ data: [{ order_id: "order", booking_id: "kit-booking", resource_id: "kit", name: "Jetson kit", dates: ["2026-11-18"], active_session: mock.active ? { id: "daily", use_date: "2026-11-18", checked_in_at: "2026-11-18T03:30:00Z" } : null }], error: null }));
  mock.create.mockResolvedValue({ token: "synthetic", expiresAt: new Date(Date.now() + 60_000).toISOString() });
});
it("generates an operator-bound daily code without touching lab attendance", async () => {
  const clearLab = vi.fn(); render(<DailyEquipmentAccess resetSignal={0} onCodeCreated={clearLab} />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate daily equipment use code" }));
  await screen.findByRole("img", { name: "One-use equipment use code" });
  expect(mock.create).toHaveBeenCalledWith("kit-booking", "check_in"); expect(clearLab).toHaveBeenCalledOnce();
  expect(mock.rpc).toHaveBeenCalledWith("get_my_equipment_daily_use");
});
it("allows an active equipment return and clears the QR after kiosk refresh", async () => {
  mock.active = true; render(<DailyEquipmentAccess resetSignal={0} onCodeCreated={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate equipment return code" }));
  await screen.findByRole("img", { name: "One-use equipment return code" });
  expect(mock.create).toHaveBeenCalledWith("kit-booking", "check_out");
  mock.active = false; fireEvent.click(screen.getByRole("button", { name: "Refresh equipment sessions" }));
  await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
});
it("clears the stale equipment code when a lab code replaces it", async () => {
  const view = render(<DailyEquipmentAccess resetSignal={0} onCodeCreated={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate daily equipment use code" }));
  await screen.findByRole("img");
  view.rerender(<DailyEquipmentAccess resetSignal={1} onCodeCreated={() => {}} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("ignores a code response after switching accounts", async () => {
  let resolve!: (value: { token: string; expiresAt: string }) => void;
  mock.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  const clearLab = vi.fn();
  const view = render(<DailyEquipmentAccess resetSignal={0} onCodeCreated={clearLab} />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate daily equipment use code" }));
  mock.userId = "another-operator"; mock.rpc.mockResolvedValue({ data: [], error: null });
  view.rerender(<DailyEquipmentAccess resetSignal={0} onCodeCreated={clearLab} />);
  resolve({ token: "obsolete", expiresAt: new Date(Date.now() + 60_000).toISOString() });
  await waitFor(() => expect(screen.queryByText("Jetson kit")).not.toBeInTheDocument());
  expect(clearLab).not.toHaveBeenCalled(); expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("ignores a previous-account inventory response", async () => {
  let resolve!: (value: unknown) => void;
  mock.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const loaded = vi.fn();
  const view = render(<DailyEquipmentAccess resetSignal={0} onCodeCreated={() => {}} onBookingsLoaded={loaded} />);
  mock.userId = "another-operator"; mock.rpc.mockResolvedValue({ data: [], error: null });
  view.rerender(<DailyEquipmentAccess resetSignal={0} onCodeCreated={() => {}} onBookingsLoaded={loaded} />);
  await waitFor(() => expect(loaded).toHaveBeenLastCalledWith([]));
  resolve({ data: [{ booking_id: "old", order_id: "old", name: "Old member kit", dates: [], active_session: null }], error: null });
  await waitFor(() => expect(screen.queryByText("Old member kit")).not.toBeInTheDocument());
  expect(loaded).toHaveBeenLastCalledWith([]);
});
