import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CabinMap } from "../../src/components/CabinMap";

const mount = vi.fn(async () => ({ dispose() {}, reset() {}, selectCabin() {} }));
vi.mock("../../src/lib/booking-map/viewer.js", () => ({ mountViewer: mount }));

it("lists every cabin with its seats and status, and works without the 3D view", () => {
  render(<CabinMap />);
  const list = screen.getByRole("list", { name: "Cabins" });
  expect(list.textContent).toContain("Cabin 101");
  expect(list.textContent).toContain("Ground floor · 4 + 2 seats");
  expect(list.textContent).toContain("First floor · 10 + 2 seats");
  expect(list.textContent).toContain("Occupied");
  expect(list.textContent).toContain("Quote");
});

it("shows Cabin 101's price and two photos but cannot book an occupied cabin", () => {
  render(<CabinMap />);
  fireEvent.click(screen.getByRole("button", { name: /Cabin 101/ }));
  expect(screen.getByText("₹80,000 per month for the whole cabin")).toBeTruthy();
  expect(screen.getByText("Cabin 101, November 2026")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Cabin 101 photos" }).querySelectorAll("button")).toHaveLength(2);
  expect((screen.getByRole("button", { name: "Cabin 101 is occupied" }) as HTMLButtonElement).disabled).toBe(true);
});

it("shows the whole-cabin quote and labels their images as illustrations", () => {
  render(<CabinMap />);
  fireEvent.click(screen.getByRole("button", { name: /Cabin 202/ }));
  expect(screen.getByRole("link", { name: "Request a quote for Cabin 202" })).toBeInTheDocument();
  expect(screen.getByText("Cabin 202, illustration based on Cabin 101")).toBeTruthy();
  expect(screen.getByText("Confirmed in your quote")).toBeTruthy();
});

it("passes only the two offered first-floor cabins to the 3D view", async () => {
  render(<CabinMap />);
  await vi.waitFor(() => expect(mount).toHaveBeenCalled());
  const options = (mount.mock.calls.at(-1) as unknown as [HTMLElement, { cabins: { code: string; detail: string }[] }])[1];
  expect(options.cabins.map(c => c.code)).toEqual(["C04", "C02"]);
  expect(options.cabins[0].detail).toBe("10 + 2 seats · ₹2,00,000/month · Quote");
});
