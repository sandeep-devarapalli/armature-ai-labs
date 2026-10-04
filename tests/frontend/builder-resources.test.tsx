import { fireEvent, render, screen } from "@testing-library/react";
import ResourceLibrary from "../../src/components/ecosystem/ResourceLibrary";

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
