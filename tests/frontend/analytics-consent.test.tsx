import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const analytics = vi.hoisted(() => ({ consent: vi.fn(), page: vi.fn() }));
vi.mock("../../src/lib/analytics", () => ({ analyticsConfigured: true, isAnalyticsPage: (path: string) => ["/", "/onboarding"].includes(path), setAnalyticsConsent: analytics.consent, trackPublicPageview: analytics.page }));
import { AnalyticsConsent, AnalyticsSettingsButton } from "../../src/components/AnalyticsConsent";
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
function show(path = "/") { return render(<MemoryRouter initialEntries={[path]}><AnalyticsConsent /><AnalyticsSettingsButton /></MemoryRouter>); }
it("keeps measurement off until explicit consent and persists a decline", () => {
  show(); expect(analytics.consent).toHaveBeenLastCalledWith(false); expect(analytics.page).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
  expect(localStorage.getItem("armature-analytics-consent")).toBe("denied");
  expect(screen.queryByRole("region")).not.toBeInTheDocument(); expect(analytics.page).not.toHaveBeenCalled();
});
it("allows analytics, reopens settings and immediately withdraws", async () => {
  show(); fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));
  expect(analytics.consent).toHaveBeenLastCalledWith(true); expect(analytics.page).toHaveBeenCalledWith("/");
  fireEvent.click(screen.getByRole("button", { name: "Analytics settings" }));
  expect(await screen.findByRole("dialog", { name: "Optional website analytics" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Withdraw consent" }));
  expect(analytics.consent).toHaveBeenLastCalledWith(false); expect(localStorage.getItem("armature-analytics-consent")).toBe("denied");
});
it("honours another tab withdrawing or clearing consent", async () => {
  localStorage.setItem("armature-analytics-consent", "granted"); show();
  localStorage.removeItem("armature-analytics-consent"); act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "armature-analytics-consent" })); });
  await waitFor(() => expect(analytics.consent).toHaveBeenLastCalledWith(false));
});
it("does not show an unsolicited banner on a private page but allows settings access", () => {
  show("/admin/members"); expect(screen.queryByRole("region")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Analytics settings" }));
  expect(screen.getByRole("dialog")).toBeVisible(); expect(analytics.page).not.toHaveBeenCalled();
});
