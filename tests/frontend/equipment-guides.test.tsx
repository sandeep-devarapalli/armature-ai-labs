import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { EquipmentGuide } from "../../src/components/EquipmentGuide";
import { equipmentGuides } from "../../src/data/equipmentGuides";
import { getComponent } from "../../src/data/components";
import { equipmentReferencePreview } from "../../scripts/vite/equipmentReferencePreview";

it("keeps guide routes connected to real catalogue records", () => {
  equipmentGuides.forEach(guide => expect(getComponent(guide.slug)).toBeDefined());
  expect(getComponent("bambu-lab-p1s-combo")).toBeDefined();
  expect(getComponent("bambu-lab-a1")).toBeDefined();
});
it("shows beginner requirements and makes hotspot descriptions keyboard accessible", () => {
  render(<MemoryRouter><EquipmentGuide guide={equipmentGuides[1]} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "3. Display connection" }));
  expect(screen.getByText(/USB-C does not supply a display signal/)).toBeVisible();
  expect(screen.getByText("Planned · not bookable")).toBeVisible();
  expect(screen.queryByRole("button", { name: /book|reserve|rent/i })).not.toBeInTheDocument();
});
it("keeps unlicensed manufacturer image serving development-only", () => {
  const plugin = equipmentReferencePreview();
  expect(plugin.apply).toBe("serve");
  expect(plugin.generateBundle).toBeUndefined();
});
it("keeps a planned printer session inside standard workspace access", () => {
  render(<MemoryRouter><EquipmentGuide guide={equipmentGuides[0]} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("Start time · IST"), { target: { value: "16" } });
  fireEvent.change(screen.getByLabelText("Slot duration"), { target: { value: "90" } });
  expect(screen.getByRole("button", { name: "Review planned session" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("17:00");
});
