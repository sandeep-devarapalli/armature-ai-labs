import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { PwaUpdatePrompt } from "../../src/components/PwaUpdatePrompt";

const fixture = vi.hoisted(() => ({ options: {} as any, activate: vi.fn().mockResolvedValue(undefined) }));
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (options: unknown) => {
    fixture.options = options;
    return { needRefresh: useState(false), offlineReady: useState(false), updateServiceWorker: fixture.activate };
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

it("offers an already waiting update without activating until requested", async () => {
  const update = vi.fn().mockResolvedValue(undefined);
  render(<PwaUpdatePrompt />);
  act(() => fixture.options.onRegisteredSW("/sw.js", { waiting: {}, update }));
  expect(await screen.findByText("New version ready")).toBeVisible();
  expect(fixture.activate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Update now" }));
  expect(fixture.activate).toHaveBeenCalledWith(true);
});

it("throttles wake-up checks, skips offline checks and cleans up listeners", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
  const update = vi.fn().mockResolvedValue(undefined);
  const { unmount } = render(<PwaUpdatePrompt />);
  act(() => fixture.options.onRegisteredSW("/sw.js", { waiting: null, update }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  fireEvent.focus(window);
  fireEvent.online(window);
  expect(update).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(170_000);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  fireEvent.focus(window);
  expect(update).toHaveBeenCalledTimes(1);
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  fireEvent.online(window);
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  unmount();
  clock.mockReturnValue(240_000);
  fireEvent.focus(window);
  expect(update).toHaveBeenCalledTimes(2);
  clock.mockRestore();
});

it("reports a failed update check and permits an immediate safe retry", async () => {
  const update = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  render(<PwaUpdatePrompt />);
  act(() => fixture.options.onRegisteredSW("/sw.js", { waiting: null, update }));
  expect(await screen.findByText("Update check unavailable")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry update check" }));
  await waitFor(() => expect(screen.queryByText("Update check unavailable")).not.toBeInTheDocument());
  expect(update).toHaveBeenCalledTimes(2);
  expect(fixture.activate).not.toHaveBeenCalled();
});

it("does not start an overlapping update or check while hidden", async () => {
  let finish!: () => void;
  const update = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
  render(<PwaUpdatePrompt />);
  act(() => fixture.options.onRegisteredSW("/sw.js", { waiting: null, update }));
  clock.mockReturnValue(170_000);
  fireEvent.focus(window);
  expect(update).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  fireEvent(document, new Event("visibilitychange"));
  expect(update).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fireEvent(document, new Event("visibilitychange"));
  expect(update).toHaveBeenCalledTimes(2);
  await act(async () => finish());
  clock.mockRestore();
});

it("lets initial service-worker installation finish without a competing update", () => {
  const update = vi.fn();
  render(<PwaUpdatePrompt />);
  act(() => fixture.options.onRegisteredSW("/sw.js", { installing: {}, waiting: null, update }));
  expect(update).not.toHaveBeenCalled();
  expect(fixture.activate).not.toHaveBeenCalled();
});
