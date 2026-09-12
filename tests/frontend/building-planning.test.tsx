import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildingPlanning } from "../../src/components/BuildingPlanning";
import { ModelBoundary } from "../../src/components/ModelBoundary";
import rooms from "../../src/data/buildingRoomServices.json";
import { buildingVisionItems } from "../../src/data/buildingVision";
import imageProvenance from "../../public/building-vision/model-aligned-r01/provenance.json";
import release from "../../src/data/buildingModelRelease.json";

vi.mock("../../src/components/BuildingModelViewer", () => ({ default: () => <div>Test 3D viewer</div> }));
afterEach(cleanup);

describe("coordinated building planning", () => {
  it("keeps model-led images bound to native provenance and preserves all earlier references", () => {
    expect(buildingVisionItems).toHaveLength(21);
    expect(new Set(buildingVisionItems.map((item) => item.image)).size).toBe(21);
    const aligned = buildingVisionItems.filter((item) => item.modelImage);
    expect(aligned.map((item) => item.sequence)).toEqual(["02", "03", "06", "10", "11", "13"]);
    for (const item of aligned) {
      const source = imageProvenance.images.find((entry) => entry.card === item.sequence);
      expect(item.modelImage?.src).toBe(`/building-vision/model-aligned-r01/${source?.file}`);
      expect([item.modelImage?.width, item.modelImage?.height]).toEqual([source?.width, source?.height]);
    }
    expect(buildingVisionItems.find((item) => item.sequence === "14")?.modelImage).toBeUndefined();
    expect(buildingVisionItems.find((item) => item.sequence === "17")?.modelNote).toContain("dresser and mirror must stay");
  });

  it("keeps native floor labels, excluded scope and service arithmetic distinct", () => {
    expect(rooms).toHaveLength(15);
    expect(new Set(rooms.map((room) => room.id)).size).toBe(15);
    expect(rooms.some((room) => room.id === "GF-05")).toBe(false);
    expect(rooms.filter((room) => room.floor === "first")).toHaveLength(6);
    expect(rooms.find((room) => room.id === "GF-10")?.sockets).toBe(52);
    expect(rooms.reduce((sum, room) => sum + room.lightWatts, 0)).toBe(807);
  });

  it("loads 3D only on request and switches room CAD with the selected floor", async () => {
    render(<BuildingPlanning />);
    expect(screen.queryByText("Test 3D viewer")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full ground floor · FreeCAD" })).toHaveAttribute("href", release.downloads.groundCad.url);
    expect(screen.getByRole("link", { name: "Both floors · Blender source" })).toHaveAttribute("href", release.downloads.blender.url);
    fireEvent.click(screen.getByRole("button", { name: "Open interactive 3D" }));
    expect(await screen.findByText("Test 3D viewer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "First floor model" }));
    expect(screen.queryByText("Test 3D viewer")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Choose a room" })).toHaveValue("FF-03");
    expect(screen.getByRole("link", { name: "Full first floor · FreeCAD" })).toHaveAttribute("href", release.downloads.firstCad.url);
    expect(screen.getByRole("img", { name: "FF-03 selected cabin Blender proposal R04" })).toHaveAttribute("src", release.roomPreviews["FF-03"].blender);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "FF-04" } });
    expect(screen.getByRole("img", { name: "FF-04 selected cabin Blender proposal R03" })).toHaveAttribute("src", "/building-models/r03/ff04-cabins.png");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "FF-06" } });
    expect(screen.getByRole("link", { name: "FF-06 · FreeCAD extract" })).toHaveAttribute("href", "/building-models/r03/rooms/FF-06.FCStd");
    expect(screen.getByText(/Selected twin cabins — dedicated lower balcony/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "FF-06 selected cabin Blender proposal R03" })).toHaveAttribute("src", "/building-models/r03/ff06-cabins.png");
    expect(screen.queryByRole("heading", { name: "Earlier S01 service estimate · not recalculated for R04" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "FF-03" } });
    expect(screen.getByRole("heading", { name: "Two- and four-person cabins" })).toBeInTheDocument();
    expect(screen.queryByText(/9.3 in/)).not.toBeInTheDocument();
    expect(screen.getByText(/two-person cabin door and inward-opening FF05/)).toBeInTheDocument();
    expect(screen.getByText(/superseded two-desk allowance/)).not.toBeVisible();
  });

  it("isolates a viewer failure from the page", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function FailedViewer(): never { throw new Error("Viewer unavailable"); }
    render(<><ModelBoundary><FailedViewer /></ModelBoundary><a href="/model.FCStd">CAD remains available</a></>);
    expect(screen.getByRole("alert")).toHaveTextContent("3D is unavailable");
    expect(screen.getByRole("link", { name: "CAD remains available" })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
