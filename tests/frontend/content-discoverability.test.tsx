import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElectricalPlan } from "../../src/components/ElectricalPlan";
import { bengaluruEcosystem } from "../../src/data/bengaluruEcosystem";
import { EcosystemPage } from "../../src/pages/EcosystemPage";
import { emptyEcosystemListing, getEcosystemListings } from "../../src/lib/ecosystem";
import { getPageSeo } from "../../src/lib/seo";
import { HomePage } from "../../src/pages/HomePage";
import { JoinPage } from "../../src/pages/PublicPages";

vi.mock("../../src/components/EcosystemMap", () => ({ EcosystemMap: () => <div>Map</div> }));
vi.mock("../../src/lib/ecosystem", async (original) => ({ ...await original<typeof import("../../src/lib/ecosystem")>(), getEcosystemListings: vi.fn() }));
vi.mock("../../src/components/FieldOfTouch", () => ({ FieldOfTouch: () => <div>Motion study</div> }));
vi.mock("../../src/context/AppContext", () => ({
  useApp: () => ({ currentMember: null, state: { applications: [] }, submitApplication: vi.fn() })
}));
const release = vi.hoisted(() => ({ memberPlatformAvailable: false, basicOnboardingAvailable: false, equipmentPageAvailable: false }));
vi.mock("../../src/config/release", () => release);
beforeEach(() => {
  release.basicOnboardingAvailable = false;
  vi.mocked(getEcosystemListings).mockResolvedValue(bengaluruEcosystem.map((data) => ({ slug: data.slug, revision: 1, data: { ...emptyEcosystemListing(data.entityType === "Research & ecosystem" ? "research-ecosystem" : "startup"), ...data } })));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("public source and planning context", () => {
  it("makes free registration discoverable while keeping paid bookings closed", () => {
    release.basicOnboardingAvailable = true;
    const join = render(<MemoryRouter><JoinPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Create your basic membership." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register for free" })).toHaveAttribute("href", "/onboarding");
    expect(screen.getByRole("link", { name: "Open registration" })).toHaveAttribute("href", "/onboarding");
    expect(screen.queryByText(/applications and bookings are not open yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Book a resource" })).not.toBeInTheDocument();
    join.unmount();
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Register for free" })).toHaveAttribute("href", "/onboarding");
    expect(screen.getByText("Free basic registration and the booking preview are open. Paid bookings remain closed.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/applications[^.]*not open/i);
    expect(screen.getByRole("link", { name: "Basic membership" })).toHaveAttribute("href", "/join");
    expect(getPageSeo("/join/").title).toBe("Basic Membership | Armature AI Labs");
  });

  it("does not publish a stale static directory in initial HTML", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/ecosystem/"]}><EcosystemPage /></MemoryRouter>);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll(".atlas-directory article")).toHaveLength(0);
    expect(document.body.textContent).toContain("Loading atlas");
    expect(document.body.textContent).not.toContain(bengaluruEcosystem[0].name);
    expect(document.body.textContent).not.toContain("Latest record review");
  });

  it("retains filtering, linked organisation selection and the current public source", async () => {
    render(<MemoryRouter initialEntries={["/ecosystem/"]}><EcosystemPage /></MemoryRouter>);
    await screen.findByText(`${bengaluruEcosystem.length} results`, { exact: false });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bellatrix" } });
    expect(await screen.findByText(/1 results ·/)).toBeInTheDocument();
    const directory = screen.getByRole("complementary", { name: "Ecosystem listings" });
    fireEvent.click(within(directory).getByText("Bellatrix Aerospace"));
    expect(screen.getByRole("heading", { name: "Bellatrix Aerospace" })).toBeInTheDocument();
    expect(directory).not.toBeVisible();
    expect(screen.getByRole("article", { name: "Bellatrix Aerospace details" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Public source" })).toHaveAttribute("href", bengaluruEcosystem.find((item) => item.slug === "bellatrix-aerospace")?.sourceUrl);
    fireEvent.click(screen.getByRole("button", { name: "Close listing details" }));
    expect(screen.queryByRole("heading", { name: "Bellatrix Aerospace" })).not.toBeInTheDocument();
    expect(directory).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveValue("Bellatrix");
    expect(within(directory).getByText("Bellatrix Aerospace")).toBeVisible();
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
