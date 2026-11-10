import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EquipmentRentalPage from "../../src/pages/EquipmentRentalPage";

const mock = vi.hoisted(() => ({ signedIn: true, request: vi.fn(), rpc: vi.fn(), sales: false }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: mock.signedIn ? { user_id: "buyer" } : null, signedIn: mock.signedIn }) }));
vi.mock("../../src/lib/rental-checkout", () => ({ rentalRequest: mock.request }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("../../src/config/release", () => ({ get equipmentSaleAvailable() { return mock.sales; } }));
vi.mock("../../src/components/EquipmentBuy", () => ({ EquipmentBuy: (props: { code: string; inStock: boolean }) => <p>Buy panel {props.code} {String(props.inStock)}</p> }));

const base = { floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null, availableFrom: null, room: null };
const products = [
  { ...base, product: "cabin101", kind: "cabin", name: "Cabin 101", weekRentPaise: null, monthRentPaise: null, depositPaise: null, status: "occupied", quantity: 1 },
  { ...base, product: "hiwonder", kind: "equipment", name: "SO-101 arm kit", category: "Robot arm", maker: "Hiwonder", version: "Advanced Kit",
    weekRentPaise: 105000, monthRentPaise: 390000, depositPaise: 2500000, salePaise: 5500000, status: "available", quantity: 2, freeUnits: 1,
    summary: "A leader and follower arm pair.", images: [{ src: "/a.jpg", alt: "Arm front" }, { src: "/b.jpg", alt: "Arm box" }],
    highlights: ["Arrives assembled"], specs: [["Degrees of freedom", "6 per arm"]], parts: [["Leader arm", "1"]],
    partsNote: "Staff check every part.", sourceLabel: "Hiwonder product page", sourceUrl: "https://www.hiwonder.com/" },
  { ...base, product: "camera", kind: "equipment", name: "USB camera", category: "Camera", maker: "Waveshare",
    dayRentPaise: 20000, weekRentPaise: 80000, monthRentPaise: null, depositPaise: 0, status: "available", quantity: 1, freeUnits: 0 },
];

const show = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/bookings/equipment" element={<EquipmentRentalPage />} /><Route path="/bookings/equipment/:code" element={<EquipmentRentalPage />} />
</Routes></MemoryRouter>);
const publicItems = products.filter(p => p.kind === "equipment").map(p => {
  const { quantity: _quantity, freeUnits, ...rest } = p as typeof p & { freeUnits?: number };
  return { ...rest, inStock: (freeUnits ?? 0) > 0 };
});
beforeEach(() => {
  mock.signedIn = true;
  mock.sales = false;
  mock.request.mockReset().mockResolvedValue({ products });
  mock.rpc.mockReset().mockResolvedValue({ data: publicItems, error: null });
});
afterEach(cleanup);

it("lets visitors browse the public list without unit counts", async () => {
  mock.signedIn = false;
  show("/bookings/equipment");
  const arm = await screen.findByRole("link", { name: /SO-101 arm kit/ });
  expect(arm).toHaveTextContent("In stock");
  expect(arm).not.toHaveTextContent("of 2");
  expect(arm).toHaveTextContent("Buy ₹55,000");
  expect(screen.getByRole("link", { name: /USB camera/ })).toHaveTextContent("Out of stock");
  expect(mock.rpc).toHaveBeenCalledWith("public_equipment_catalog");
  expect(mock.request).not.toHaveBeenCalled();
});

it("asks visitors to sign in to rent from an item page", async () => {
  mock.signedIn = false;
  show("/bookings/equipment/hiwonder");
  expect(await screen.findByRole("link", { name: "Sign in to rent" })).toHaveAttribute("href", "/auth?next=%2Fbookings%2Fequipment%2Fhiwonder");
  expect(screen.queryByRole("link", { name: "Request to rent" })).not.toBeInTheDocument();
  expect(screen.getByRole("row", { name: "Refundable deposit ₹25,000" })).toBeInTheDocument();
});

it("shows an error when the public list fails", async () => {
  mock.signedIn = false;
  mock.rpc.mockResolvedValue({ data: null, error: new Error("down") });
  show("/bookings/equipment");
  expect(await screen.findByRole("alert")).toHaveTextContent("Equipment could not load");
});

it("lists equipment only, with stock and prices", async () => {
  show("/bookings/equipment");
  const arm = await screen.findByRole("link", { name: /SO-101 arm kit/ });
  expect(arm).toHaveAttribute("href", "/bookings/equipment/hiwonder");
  expect(arm).toHaveTextContent("1 of 2 available");
  expect(arm).toHaveTextContent("Rent ₹1,050 / 7 days");
  expect(arm).toHaveTextContent("Buy ₹55,000");
  expect(screen.getByRole("link", { name: /USB camera/ })).toHaveTextContent("Out of stock");
  expect(screen.getByRole("link", { name: /USB camera/ })).toHaveTextContent("from ₹200 / day");
  expect(screen.queryByText("Cabin 101")).not.toBeInTheDocument();
});

it("shows an item's prices, specs and parts, and sends Rent to the booking page", async () => {
  show("/bookings/equipment/hiwonder");
  expect(await screen.findByRole("heading", { name: "SO-101 arm kit" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Request to rent" })).toHaveAttribute("href", "/bookings?item=kit&product=hiwonder#steps");
  expect(screen.getByRole("row", { name: "Refundable deposit ₹25,000" })).toBeInTheDocument();
  expect(screen.getByText("6 per arm")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: "Leader arm 1" })).toBeInTheDocument();
  expect(screen.getByText(/Online buying opens later/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /buy/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Arm box" }));
  expect(screen.getByRole("img", { name: "Arm box" })).toBeInTheDocument();
});

it("blocks renting an out-of-stock item and shows no deposit as None", async () => {
  show("/bookings/equipment/camera");
  expect(await screen.findByRole("button", { name: "Out of stock" })).toBeDisabled();
  expect(screen.queryByRole("link", { name: "Request to rent" })).not.toBeInTheDocument();
  expect(screen.getByRole("row", { name: "Refundable deposit None" })).toBeInTheDocument();
});

it("says when an item is not listed", async () => {
  show("/bookings/equipment/cabin101");
  expect(await screen.findByText(/This item is not listed/)).toBeInTheDocument();
});

it("shows the buy panel instead of the email note once online buying is on", async () => {
  mock.sales = true;
  show("/bookings/equipment/hiwonder");
  expect(await screen.findByText("Buy panel hiwonder true")).toBeInTheDocument();
  expect(screen.queryByText(/Online buying opens later/)).not.toBeInTheDocument();
});
