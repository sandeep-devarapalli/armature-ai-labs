import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ElectricalPlan } from "../../src/components/ElectricalPlan";
import { bengaluruEcosystem } from "../../src/data/bengaluruEcosystem";
import { EcosystemPage } from "../../src/pages/EcosystemPage";
import { JoinPage } from "../../src/pages/PublicPages";

vi.mock("../../src/components/EcosystemMap", () => ({ EcosystemMap: () => <div>Map</div> }));
vi.mock("../../src/context/AppContext", () => ({
  useApp: () => ({ currentMember: null, state: { applications: [] }, submitApplication: vi.fn() })
}));
vi.mock("../../src/config/release", () => ({ memberPlatformAvailable: false }));

afterEach(cleanup);

describe("public source and planning context", () => {
  it("includes every ecosystem summary and public source in initial HTML", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/ecosystem/"]}><EcosystemPage /></MemoryRouter>);
    const document = new DOMParser().parseFromString(html, "text/html");
    const entries = document.querySelectorAll(".ecosystem-directory-list article");
    expect(entries).toHaveLength(bengaluruEcosystem.length);
    for (const item of bengaluruEcosystem) {
      const link = document.querySelector(`a[href="/ecosystem/?focus=${item.slug}"]`);
      expect(link).not.toBeNull();
      const entry = link!.closest("article")!;
      expect(entry.textContent).toContain(item.summary);
      expect(entry.querySelector('a[aria-label$="public source"]')?.getAttribute("href")).toBe(item.sourceUrl);
    }
    expect(document.querySelector(".ecosystem-method time")?.getAttribute("datetime")).toBe("2026-08-08");
    expect(document.body.textContent).toContain("Latest record review");
  });

  it("retains filtering and linked organization selection", () => {
    render(<MemoryRouter initialEntries={["/ecosystem/"]}><EcosystemPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bellatrix" } });
    expect(screen.getByText("1 result")).toBeInTheDocument();
    const directory = screen.getByRole("complementary", { name: "Organization list" });
    fireEvent.click(within(directory).getByRole("link", { name: /Bellatrix Aerospace.*Space hardware/ }));
    expect(screen.getByRole("heading", { name: "Bellatrix Aerospace" })).toBeInTheDocument();
    expect(within(directory).getByRole("link", { name: /Bellatrix Aerospace.*Space hardware/ })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close organization details" }));
    expect(screen.queryByRole("heading", { name: "Bellatrix Aerospace" })).not.toBeInTheDocument();
  });

  it("labels electrical energy and quantities as estimates, not installed equipment", () => {
    const { container } = render(<ElectricalPlan />);
    const summary = container.querySelector(".electrical-summary")!;
    expect(summary).toHaveTextContent("Proposed backup");
    expect(summary).toHaveTextContent("estimated nominal battery capacity 6.16 kWh");
    expect(summary).toHaveTextContent("Proposed points");
    expect(summary).toHaveTextContent("Estimated connected load");
    expect(summary).not.toHaveTextContent(/installed/i);
  });

  it("presents membership as enquiries only and retires unverified capacity claims", () => {
    render(<MemoryRouter><JoinPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Build with us. Enquire about membership." })).toBeInTheDocument();
    expect(screen.getByText("Pre-launch · enquiries only")).toBeInTheDocument();
    expect(screen.getByText(/current layout proposes seven cabins/)).toBeInTheDocument();
    expect(screen.queryByText(/sixteen|50-person/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email the lab" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
    expect(screen.queryByRole("link", { name: "Create member account" })).not.toBeInTheDocument();
  });
});
