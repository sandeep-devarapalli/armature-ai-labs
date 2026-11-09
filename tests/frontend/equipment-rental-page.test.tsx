import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EquipmentRentalPage from "../../src/pages/EquipmentRentalPage";

const mock = vi.hoisted(() => ({ signedIn: true, request: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: mock.signedIn ? { user_id: "buyer" } : null, signedIn: mock.signedIn }) }));
vi.mock("../../src/lib/rental-checkout", () => ({ rentalRequest: mock.request }));

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
beforeEach(() => { mock.signedIn = true; mock.request.mockReset().mockResolvedValue({ products }); });
afterEach(cleanup);

it("asks visitors to sign in and does not call the catalogue", () => {
  mock.signedIn = false;
  show("/bookings/equipment/hiwonder");
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth?next=%2Fbookings%2Fequipment%2Fhiwonder");
  expect(mock.request).not.toHaveBeenCalled();
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
