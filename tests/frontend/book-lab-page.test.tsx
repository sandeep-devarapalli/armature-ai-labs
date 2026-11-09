import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BookLabPage from "../../src/pages/BookLabPage";

const mock = vi.hoisted(() => ({ desk: true, rental: true, signedIn: true, request: vi.fn() }));
vi.mock("../../src/config/release", () => ({ get deskCheckoutAvailable() { return mock.desk; }, get rentalCheckoutAvailable() { return mock.rental; } }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: mock.signedIn ? { user_id: "buyer" } : null, signedIn: mock.signedIn }) }));
vi.mock("../../src/lib/rental-checkout", () => ({ rentalRequest: mock.request }));
vi.mock("../../src/components/DeskCheckout", () => ({ DeskBooking: () => <p>Desk checkout</p> }));
vi.mock("../../src/components/RentalCheckout", () => ({ RentalBooking: ({ initialProduct }: { initialProduct?: string }) => <p>Rental checkout: {initialProduct ?? "none"}</p> }));
vi.mock("../../src/lib/booking-map/viewer.js", () => ({ mountViewer: async () => ({ dispose() {}, reset() {}, selectCabin() {} }) }));

const product = (fields: object) => ({ floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null, weekRentPaise: null, monthRentPaise: null,
  dayRentPaise: null, depositPaise: null, availableFrom: null, quantity: 1, status: "available", ...fields });
const products = [
  product({ product: "cabin101", kind: "cabin", name: "Cabin 101", room: "GF-01", status: "occupied" }),
  product({ product: "cabin201", kind: "cabin", name: "Cabin 201", room: "FF-06", status: "available" }),
  product({ product: "so101", kind: "equipment", name: "SO-101 arm", weekRentPaise: 80000, monthRentPaise: 250000 }),
  product({ product: "camera", kind: "equipment", name: "USB camera", dayRentPaise: 20000, weekRentPaise: 80000 })
];

function Where() { const { pathname, search } = useLocation(); return <output aria-label="Location">{pathname + search}</output>; }
const show = (path = "/bookings") => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/bookings" element={<><BookLabPage /><Where /></>} /></Routes></MemoryRouter>);
beforeEach(() => { mock.desk = true; mock.rental = true; mock.signedIn = true; mock.request.mockReset().mockResolvedValue({ products }); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

it("compares desk, cabins, equipment and events, with live equipment prices", async () => {
  show();
  expect(screen.getByRole("heading", { name: "Book the lab." })).toBeInTheDocument();
  expect(screen.getAllByRole("row").map(r => r.querySelector("strong")?.textContent).filter(Boolean)).toEqual(["Desk pass", "Team cabins", "Equipment", "Event space"]);
  expect(screen.getByText("₹20,000 / seat a month")).toBeInTheDocument();
  expect(await screen.findByText("From ₹200 / day")).toBeInTheDocument();
  expect(screen.getByText("101 occupied · 201 available · 202 coming soon · 203 coming soon")).toBeInTheDocument();
});

it("shows only the rows whose checkout is enabled", () => {
  mock.rental = false;
  show();
  expect(screen.getByRole("button", { name: "Choose desk pass" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose team cabins" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose equipment" })).not.toBeInTheDocument();
  expect(mock.request).not.toHaveBeenCalled();
});

it("keeps the chosen row in the address and opens its checkout below", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Choose desk pass" }));
  expect(screen.getByLabelText("Location").textContent).toBe("/bookings?item=desk");
  expect(screen.getByText("Desk checkout")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Choose event space" }));
  expect(screen.getByText(/Event bookings open soon/)).toBeInTheDocument();
  expect(screen.queryByText("Desk checkout")).not.toBeInTheDocument();
});

it("opens the rental checkout on the cabin picked on the map, but never for an occupied cabin", async () => {
  show("/bookings?item=cabin&cabin=C01");
  expect(screen.getByRole("button", { name: "Cabin 101 is occupied" })).toBeDisabled();
  expect(screen.queryByText(/Rental checkout/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Cabin 201/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Book Cabin 201" }));
  expect(screen.getByLabelText("Location").textContent).toBe("/bookings?item=cabin&cabin=C04");
  expect(screen.getByText("Rental checkout: cabin201")).toBeInTheDocument();
});

it("passes the picked equipment item to the rental checkout", async () => {
  show("/bookings?item=kit");
  expect(screen.getByText("Rental checkout: none")).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Compare specs, photos and what's in the box" })).toHaveAttribute("href", "/bookings/equipment");
  fireEvent.click(await screen.findByRole("button", { name: /USB camera/ }));
  await waitFor(() => expect(screen.getByText("Rental checkout: camera")).toBeInTheDocument());
  expect(screen.getByLabelText("Location").textContent).toBe("/bookings?item=kit&product=camera");
  expect(screen.getByRole("link", { name: /Specs, photos and what's in the box for USB camera/ })).toHaveAttribute("href", "/bookings/equipment/camera");
});

it("shows the cabins' published statuses to visitors who are not signed in", () => {
  mock.signedIn = false;
  show("/bookings?item=cabin");
  expect(mock.request).not.toHaveBeenCalled();
  expect(screen.getByText("101 occupied · 201 coming soon · 202 coming soon · 203 coming soon")).toBeInTheDocument();
  expect(screen.getByText(/No cabin is open for booking yet/)).toBeInTheDocument();
});
