import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildingPlanning } from "../../src/components/BuildingPlanning";
import { BuildingVisionPage } from "../../src/pages/BuildingVisionPage";
import { ModelBoundary } from "../../src/components/ModelBoundary";
import rooms from "../../src/data/buildingRooms";
import releasedRooms from "../../src/data/buildingRoomServices.json";
import roomCad from "../../src/data/buildingRoomCad.json";
import roomViews from "../../src/data/buildingRoomViews.json";
import { buildingVisionItems } from "../../src/data/buildingVision";
import imageProvenance from "../../public/building-vision/model-aligned-r01/provenance.json";
import release from "../../src/data/buildingModelRelease.json";

vi.mock("../../src/components/BuildingModelViewer", () => ({ default: () => <div>Test 3D viewer</div> }));
afterEach(cleanup);

describe("coordinated building planning", () => {
  it("labels GF-03 as the confirmed bathroom without changing released service allowances", () => {
    const room = rooms.find((item) => item.id === "GF-03")!;
    const released = releasedRooms.find((item) => item.id === room.id)!;
    expect(room.name).toBe("Bathroom");
    expect(room.status).toBe("Confirmed bathroom");
    for (const key of ["sockets", "lights", "lightWatts", "equipmentWatts"] as const) expect(room[key]).toBe(released[key]);
    expect(rooms.filter((item) => item.id !== room.id)).toEqual(releasedRooms.filter((item) => item.id !== room.id));
    render(<BuildingVisionPage />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: room.id } });
    expect(screen.getByRole("heading", { name: "Bathroom" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GF-03 · Bathroom" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GF-03 · Bathroom" })).toBeInTheDocument();
    expect(screen.queryByText(/PB09 sanitary classification is not field-confirmed/)).not.toBeInTheDocument();
    expect(screen.queryByText("Verify sanitary use without inferring fixtures.")).not.toBeInTheDocument();
  });

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

  it("provides an individual Blender view and native CAD downloads for all fifteen included rooms", () => {
    expect(roomViews.map((view) => view.id).sort()).toEqual(["FF-01", "FF-05", "GF-01", "GF-02", "GF-03", "GF-04", "GF-06", "GF-07", "GF-08", "GF-09", "GF-10"]);
    for (const view of roomViews) {
      expect(view.image).toBe(`/building-vision/room-views-r01/${view.id}.png`);
      expect(view.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(view.width).toBeGreaterThan(0);
      expect(view.height).toBeGreaterThan(0);
      expect(view.caption.length).toBeGreaterThan(0);
    }
    render(<BuildingPlanning />);
    for (const room of rooms) {
      fireEvent.click(screen.getByRole("button", { name: `${room.floor === "ground" ? "Ground" : "First"} floor model` }));
      fireEvent.change(screen.getByRole("combobox"), { target: { value: room.id } });
      const view = roomViews.find((item) => item.id === room.id);
      const source = view?.image ?? (room.id === "FF-02" ? release.enclosure.blender : release.roomPreviews[room.id as keyof typeof release.roomPreviews].blender);
      const cad = roomCad.find((item) => item.id === room.id)!;
      expect(screen.getByRole("heading", { name: room.name })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: `${room.id} · Blender PNG` })).toHaveAttribute("href", source);
      expect(screen.getByRole("link", { name: `${room.id} · FreeCAD extract` })).toHaveAttribute("href", cad.downloads.freecad.url);
      expect(screen.getByRole("link", { name: `${room.id} · STEP extract` })).toHaveAttribute("href", cad.downloads.step.url);
      expect(screen.getByRole("link", { name: `${room.id} · plan SVG` })).toHaveAttribute("href", cad.downloads.svg.url);
      if (view) {
        expect(screen.getByRole("heading", { name: "Room view · Blender" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: `${room.id} · ${room.name} · native Blender room view` })).toHaveAttribute("loading", "lazy");
        expect(screen.getByText(view.caption)).toBeInTheDocument();
      }
      expect(screen.queryByText("Test 3D viewer")).not.toBeInTheDocument();
    }
  });

  it("filters fifteen room views and two floor overviews without a fixed historical count", () => {
    const { container } = render(<BuildingVisionPage />);
    expect(container.querySelectorAll(".building-vision-model-image img")).toHaveLength(17);
    expect(screen.getByText("Showing 17 of 17 views")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ground floor" }));
    expect(container.querySelectorAll(".building-vision-model-image img")).toHaveLength(10);
    expect(screen.getByText("Showing 10 of 17 views")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "First floor" }));
    expect(container.querySelectorAll(".building-vision-model-image img")).toHaveLength(7);
    expect(screen.getByText("Showing 7 of 17 views")).toBeInTheDocument();
    expect(screen.queryByText("Test 3D viewer")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: /Enclosure proposal/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "FF-02" } });
    expect(screen.getByRole("heading", { name: "Enclosure proposal C04 · Blender" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /FF-02 proposed aluminium-framed glass enclosure and glass roof/ })).toHaveAttribute("src", release.enclosure.blender);
    expect(screen.getByRole("link", { name: "FF-02 · enclosure FreeCAD" })).toHaveAttribute("href", release.enclosure.freecad);
    expect(screen.getByRole("link", { name: "FF-02 · enclosure STEP" })).toHaveAttribute("href", release.enclosure.step);
    expect(screen.getByLabelText("Open FF-02 glass roof render")).toHaveAttribute("href", release.enclosure.roof);
    expect(screen.getByLabelText("Open FF-02 inside layout render")).toHaveAttribute("href", release.enclosure.layout);
    expect(screen.getByRole("link", { name: "FF-02 · FreeCAD extract" })).toHaveAttribute("href", "/building-models/r06/rooms/FF-02.FCStd");
    expect(screen.getByText(/Existing back and right masonry walls/)).toBeInTheDocument();
    expect(screen.queryByText(/three fixed windows/)).not.toBeInTheDocument();
    expect(screen.queryByText(/full first-floor CAD download predates/)).not.toBeInTheDocument();
    expect(screen.getByText(/not a structural, thermal or fabrication design/)).toBeInTheDocument();
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
