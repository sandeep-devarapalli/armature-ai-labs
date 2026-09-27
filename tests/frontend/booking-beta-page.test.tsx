import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BookingBetaPage } from "../../src/pages/BookingBetaPage";
vi.mock("../../src/components/BookingBetaMap", () => ({ BookingBetaMap: ({ places, onSelect }: { places: { code: string }[]; onSelect: (id: string) => void }) => <button onClick={() => onSelect(places[0].code)}>Explore {places[0].code}</button> }));

it("explores a chair without creating a booking or presenting checkout", () => {
  render(<BookingBetaPage />);
  fireEvent.click(screen.getByRole("button", { name: "Explore S01" }));
  expect(screen.getByRole("heading", { name: "S01 · GF-10" })).toBeVisible();
  expect(screen.getByText(/No reservation has been created/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /confirm|reserve|pay|submit/i })).not.toBeInTheDocument();
});
it("limits student estimates to individual passes when changing to a cabin", () => {
  render(<BookingBetaPage />);
  fireEvent.change(screen.getByRole("combobox", { name: /Student discount estimate/ }), { target: { value: "20" } });
  expect(screen.getByText("₹280")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Pass type"), { target: { value: "cabin" } });
  expect(screen.queryByRole("combobox", { name: /Student discount estimate/ })).not.toBeInTheDocument();
  expect(screen.getAllByText("₹52,500").length).toBeGreaterThan(0);
});
it("requires review rather than displaying a total for a week crossing launch expiry", () => {
  render(<BookingBetaPage />);
  fireEvent.change(screen.getByLabelText("Pass type"), { target: { value: "week" } });
  fireEvent.change(screen.getByLabelText("Week start date"), { target: { value: "2026-12-28" } });
  expect(screen.queryByText("Estimated total")).not.toBeInTheDocument();
});
