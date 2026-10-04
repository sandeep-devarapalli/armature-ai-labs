import { fireEvent, render, screen } from "@testing-library/react";
import ResourceLibrary from "../../src/components/ecosystem/ResourceLibrary";
import { builderResources } from "../../src/data/builderResources";

it("uses a section heading with named resources as subordinate headings", () => {
  render(<ResourceLibrary />);
  expect(screen.getByRole("heading", { level: 2, name: "Tools & resources for builders" })).toBeVisible();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  for (const name of ["CopperPilot", "build123d", "LeRobot", "BlenderProc"]) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeVisible();
  }
  expect(screen.getByRole("button", { name: "All resources" })).toHaveAttribute("aria-pressed", "true");
});

it("combines case-insensitive search with category selection and resets empty results", () => {
  render(<ResourceLibrary />);
  const search = screen.getByRole("searchbox", { name: "Search tools, workflows and resources" });
  fireEvent.click(screen.getByRole("button", { name: "Mechanical CAD" }));
  expect(screen.getByRole("button", { name: "Mechanical CAD" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("heading", { name: "copperhead" })).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "  BUILD123D  " } });
  expect(screen.getByRole("heading", { level: 3, name: "build123d" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Electronics & PCB" }));
  expect(screen.queryByRole("heading", { name: "build123d" })).not.toBeInTheDocument();
  expect(screen.getByText(/No resources match/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(search).toHaveValue("");
  expect(screen.getByRole("button", { name: "All resources" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("heading", { name: "CopperPilot" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "build123d" })).toBeVisible();
});

it("reveals more resources while searching the entire catalog, not just visible rows", () => {
  render(<ResourceLibrary />);
  expect(screen.getAllByRole("link", { name: /^Explore / })).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Show more resources" }));
  expect(screen.getAllByRole("link", { name: /^Explore / }).length).toBeGreaterThan(4);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tools, workflows and resources" }), { target: { value: "CadQuery" } });
  expect(screen.getByRole("heading", { level: 3, name: "CadQuery" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "copperhead" })).not.toBeInTheDocument();
});

it("links tools directly to the supplied project sources without treating them as installations", () => {
  render(<ResourceLibrary />);
  const expected = {
    CopperPilot: "https://copperpilot.ai/",
    build123d: "https://github.com/gumyr/build123d",
    LeRobot: "https://huggingface.co/docs/lerobot/index",
    BlenderProc: "https://github.com/DLR-RM/BlenderProc"
  };
  for (const [name, url] of Object.entries(expected)) {
    const link = screen.getByRole("link", { name: `Explore tool: ${name}` });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noreferrer|noopener/);
  }
});

it("prioritizes CopperPilot while keeping copperhead discoverable", () => {
  render(<ResourceLibrary />);
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("CopperPilot");
  expect(screen.queryByRole("heading", { name: "copperhead" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Electronics & PCB" }));
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("CopperPilot");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tools, workflows and resources" }), { target: { value: "copperhead" } });
  expect(screen.getByRole("heading", { name: "copperhead" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Explore tool: copperhead" })).toHaveAttribute("href", "https://github.com/copperheadhq/copperhead");
});

it("reveals the original hardware suppliers, thirty-nine additional leads and one directory through pagination", () => {
  render(<ResourceLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "Hardware suppliers" }));
  expect(screen.getByRole("button", { name: "Hardware suppliers" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("54 resources found. Showing 4.");
  expect(screen.queryByRole("heading", { name: "CopperPilot" })).not.toBeInTheDocument();
  for (const count of [12, 20, 28, 36, 44, 52, 54]) {
    fireEvent.click(screen.getByRole("button", { name: "Show more resources" }));
    expect(screen.getByRole("status")).toHaveTextContent(`54 resources found. Showing ${count}.`);
  }
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(54);
  const originalSuppliers = ["Robu.in", "Visha World", "MG Super Labs", "Evelta", "Sunrom", "Fab.to.Lab", "Thingbits", "Robokits India", "ProtoCentral", "Hubtronics", "Robocraze", "Zbotic", "FlyRobo", "RoboticsDNA"];
  for (const name of originalSuppliers) {
    expect(screen.getByRole("heading", { level: 3, name })).toBeVisible();
    expect(screen.getByRole("link", { name: `Visit website: ${name}` })).toHaveTextContent("Visit website");
  }
  expect(screen.getAllByRole("link", { name: /^(Visit website|View on Maps):/ }).filter(link => !originalSuppliers.some(name => link.getAttribute("aria-label") === `Visit website: ${name}`))).toHaveLength(39);
  expect(screen.getByRole("link", { name: /^View directory: MakerVille/ })).toHaveTextContent("View directory");
  expect(screen.queryByRole("button", { name: "Show more resources" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /^Explore tool:/ })).not.toBeInTheDocument();
});

it("keeps supplier and directory destinations unique and uses safe outbound links", () => {
  render(<ResourceLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "Hardware suppliers" }));
  for (let page = 0; page < 7; page += 1) fireEvent.click(screen.getByRole("button", { name: "Show more resources" }));
  const suppliers = builderResources.filter(resource => resource.category === "suppliers");
  expect(builderResources).toHaveLength(99);
  expect(suppliers.filter(resource => resource.kind === "supplier")).toHaveLength(52);
  expect(suppliers.filter(resource => resource.kind === "listing")).toHaveLength(1);
  expect(suppliers.filter(resource => resource.kind === "directory")).toHaveLength(1);
  expect(new Set(builderResources.map(resource => resource.id)).size).toBe(builderResources.length);
  expect(new Set(builderResources.map(resource => resource.url.replace(/\/+$/, ""))).size).toBe(builderResources.length);
  expect(new Set(suppliers.map(resource => resource.name.trim().toLowerCase())).size).toBe(suppliers.length);
  const destinations = suppliers.map(resource => {
    const url = new URL(resource.url);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  });
  expect(new Set(destinations).size).toBe(suppliers.length);
  for (const resource of suppliers) {
    const label = resource.kind === "directory" ? "View directory" : resource.kind === "listing" ? "View on Maps" : "Visit website";
    const link = screen.getByRole("link", { name: `${label}: ${resource.name}` });
    expect(link).toHaveAttribute("href", resource.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toMatch(/noreferrer|noopener/);
  }
});

it("labels the Maps-only business without inventing a website", () => {
  render(<ResourceLibrary />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tools, workflows and resources" }), { target: { value: "Kamla" } });
  expect(screen.getByRole("heading", { name: "Kamla Hardware Mart" })).toBeVisible();
  const link = screen.getByRole("link", { name: "View on Maps: Kamla Hardware Mart" });
  expect(link).toHaveTextContent("View on Maps");
  expect(link).toHaveAttribute("href", "https://maps.app.goo.gl/fDXe3T5oWGTpYsA9A");
  expect(screen.getByText(/Google Maps listing; no official website listed/)).toBeVisible();
  expect(screen.queryByRole("link", { name: /^Visit website:/ })).not.toBeInTheDocument();
});

it.each([
  ["Comkey", /MakerVille-listed; website certificate warning.*Current service unconfirmed/],
  ["Techtonics", /MakerVille-listed; site access check blocked catalog review/],
  ["PCBKingdom", /MakerVille-listed; website certificate warning.*Current service unconfirmed/],
  ["Pinnacle Cases", /MakerVille-listed; website did not resolve.*Current service unconfirmed/],
  ["Hatchnhack / HNH Cart", /MakerVille-listed; online store displayed unavailable.*Current service unconfirmed/]
])("retains the source and access caution when searching for %s", (name, caution) => {
  render(<ResourceLibrary />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search tools, workflows and resources" }), { target: { value: name } });
  expect(screen.getByRole("heading", { name })).toBeVisible();
  expect(screen.getByRole("link", { name: `Visit website: ${name}` })).toBeVisible();
  expect(screen.getByText(caution)).toBeVisible();
});

it("finds hardware suppliers and the vendor directory beyond the initial visible tools", () => {
  render(<ResourceLibrary />);
  const search = screen.getByRole("searchbox", { name: "Search tools, workflows and resources" });
  fireEvent.change(search, { target: { value: "  ROBU  " } });
  expect(screen.getByRole("heading", { name: "Robu.in" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Visit website: Robu.in" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Mechanical CAD" }));
  expect(screen.getByText(/No resources match/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Hardware suppliers" }));
  expect(screen.getByRole("heading", { name: "Robu.in" })).toBeVisible();
  fireEvent.change(search, { target: { value: "vendor" } });
  for (let page = 0; page < 7; page += 1) {
    const showMore = screen.queryByRole("button", { name: "Show more resources" });
    if (showMore) fireEvent.click(showMore);
  }
  expect(screen.getByRole("link", { name: /^View directory: MakerVille/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("CopperPilot");
});

it.each(["Camera mount", "Robot sensor pod", "PCB enclosure"])("opens and closes the %s project without clearing resource search", name => {
  render(<ResourceLibrary />);
  const search = screen.getByRole("searchbox", { name: "Search tools, workflows and resources" });
  fireEvent.change(search, { target: { value: "build123d" } });
  const trigger = screen.getByRole("button", { name });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("heading", { level: 3, name })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back to resources" }));
  expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
  expect(search).toHaveValue("build123d");
  expect(screen.getByRole("heading", { level: 3, name: "build123d" })).toBeVisible();
});
