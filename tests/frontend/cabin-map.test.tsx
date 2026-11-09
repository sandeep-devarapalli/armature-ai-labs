import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CabinMap } from "../../src/components/CabinMap";
import { cabins } from "../../src/lib/cabins";

const mount = vi.fn(async () => ({ dispose() {}, reset() {}, selectCabin() {} }));
vi.mock("../../src/lib/booking-map/viewer.js", () => ({ mountViewer: mount }));

it("lists every cabin with its seats and status, and works without the 3D view", () => {
  render(<CabinMap onChoose={() => {}} />);
  const list = screen.getByRole("list", { name: "Cabins" });
  expect(list.textContent).toContain("Cabin 101");
  expect(list.textContent).toContain("Ground floor · 4 + 2 seats");
  expect(list.textContent).toContain("First floor · 10 + 2 seats");
  expect(list.textContent).toContain("Occupied");
  expect(list.textContent).toContain("Coming soon");
});

it("shows Cabin 101's price and two photos but cannot book an occupied cabin", () => {
  const choose = vi.fn();
  render(<CabinMap onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: /Cabin 101/ }));
  expect(screen.getByText("₹20,000 a seat · ₹80,000 a month")).toBeTruthy();
  expect(screen.getByText("Cabin 101, November 2026")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Cabin 101 photos" }).querySelectorAll("button")).toHaveLength(2);
  expect((screen.getByRole("button", { name: "Cabin 101 is occupied" }) as HTMLButtonElement).disabled).toBe(true);
  expect(choose).not.toHaveBeenCalled();
});

it("keeps coming-soon cabins unbookable and without photos", () => {
  render(<CabinMap onChoose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: /Cabin 202/ }));
  expect((screen.getByRole("button", { name: "Cabin 202 is coming soon" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Photos of Cabin 202 are coming. It is fitted out like Cabin 101.")).toBeTruthy();
  expect(screen.queryByText(/November 2026/)).toBeNull();
});

it("lets an available cabin be chosen and passes the room list to the 3D view", async () => {
  const choose = vi.fn();
  const open = cabins.map(c => c.code === "C04" ? { ...c, status: "available" as const } : c);
  render(<CabinMap list={open} onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Book Cabin 201" }));
  expect(choose).toHaveBeenCalledWith("C04");
  await vi.waitFor(() => expect(mount).toHaveBeenCalled());
  const options = (mount.mock.calls.at(-1) as unknown as [HTMLElement, { cabins: { code: string; detail: string }[] }])[1];
  expect(options.cabins.map(c => c.code)).toEqual(["C04", "C02", "C03"]);
  expect(options.cabins[0].detail).toBe("10 + 2 seats · ₹2,00,000/mo");
});
