import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { EcosystemPage } from "../../src/pages/EcosystemPage";
import { AdminRoute } from "../../src/components/RouteGuard";
import { EcosystemAdminPage } from "../../src/pages/EcosystemAdminPage";
import { emptyEcosystemListing, getEcosystemListings, getEcosystemSubmissions, hydrateEcosystemListing, type EcosystemListing } from "../../src/lib/ecosystem";

vi.mock("../../src/lib/ecosystem", async (original) => ({ ...await original<typeof import("../../src/lib/ecosystem")>(), getEcosystemListings: vi.fn(), getEcosystemSubmissions: vi.fn() }));
vi.mock("../../src/components/EcosystemMap", () => ({ EcosystemMap: ({ entities }: { entities: { slug: string; coordinates?: number[] }[] }) => <div data-testid="synthetic-map">{entities.filter((item) => item.coordinates).map((item) => <span key={item.slug}>{item.slug} pin</span>)}</div> }));
vi.mock("../../src/context/AppContext", () => ({ useApp: () => ({ isAdmin: false, isStaff: true, loading: false }) }));
const records: EcosystemListing[] = [
  { slug: "fixture-robotics", revision: 4, data: { ...emptyEcosystemListing(), slug: "fixture-robotics", name: "Fixture Robotics", summary: "Database-published robotics company", needs: ["build"], locality: "HSR Layout", sourceUrl: "https://example.test/current-source", googleMapsUrl: "https://maps.app.goo.gl/synthetic-place", verifiedAt: "2026-10-02", publicPhones: [{ label: "Reception", number: "+91 9876543210" }] } },
  { slug: "fixture-parts", revision: 2, data: { ...emptyEcosystemListing("supplier"), slug: "fixture-parts", name: "Fixture Parts", summary: "Database-published electronics supplier", needs: ["source"], locality: "SP Road", coordinates: [77.58, 12.96], locationPrecision: "Locality-level", sourceUrl: "https://example.test/parts" } }
];

function HistoryControls() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output aria-label="Current URL">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}
function setup(path = "/ecosystem") { return render(<MemoryRouter initialEntries={[path]}><HistoryControls /><EcosystemPage /></MemoryRouter>); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getEcosystemListings).mockResolvedValue(records); Element.prototype.scrollIntoView = vi.fn(); });

it("fills optional fields for sparse approved data without adding dates, pins or stale records", () => {
  const row = hydrateEcosystemListing({ slug: "sparse", revision: 1, data: { primaryType: "supplier", name: "Sparse fixture", summary: "Only sourced public information", sourceUrl: "https://example.test/source" } } as EcosystemListing);
  expect(row.data.publicPhones).toEqual([]); expect(row.data.needs).toEqual([]); expect(row.data.sectors).toEqual([]);
  expect(row.data.verifiedAt).toBe(""); expect(row.data.coordinates).toBeUndefined(); expect(row.data.slug).toBe("sparse");
});

it("renders only database-published sources and retains unpinned listings", async () => {
  setup("/ecosystem?focus=fixture-robotics");
  await screen.findByRole("heading", { name: "Fixture Robotics" });
  expect(screen.getByRole("link", { name: "Public source" })).toHaveAttribute("href", "https://example.test/current-source");
  expect(screen.getByText("2 results · 1 on map")).toBeInTheDocument();
  expect(screen.getByTestId("synthetic-map")).not.toHaveTextContent("fixture-robotics pin");
  expect(screen.getByTestId("synthetic-map")).toHaveTextContent("fixture-parts pin");
  expect(screen.queryByText("Niqo Robotics")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "+91 9876543210" })).toHaveAttribute("href", "tel:+919876543210");
  expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute("href", records[0].data.googleMapsUrl);
  expect(screen.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", records[0].data.googleMapsUrl);
  expect(screen.getByText("No confirmed map pin. Contact the place before visiting.")).toBeInTheDocument();
  expect(screen.queryByText(/Record confidence|Workbook trail|Directory record/i)).not.toBeInTheDocument();
});

it("applies query, type, need and focus from a shareable URL", async () => {
  setup("/ecosystem?q=parts&type=supplier&need=source&focus=fixture-parts");
  await screen.findByRole("heading", { name: "Fixture Parts" });
  expect(screen.getByRole("article", { name: "Fixture Parts details" })).toHaveFocus();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close listing details" }));
  fireEvent.click(screen.getByText(/More filters/));
  expect(screen.getByRole("searchbox")).toHaveValue("parts");
  expect(screen.getByRole("button", { name: "Suppliers" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "source" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("1 results · 1 on map")).toBeInTheDocument();
  expect(within(screen.getByRole("complementary", { name: "Ecosystem listings" })).queryByText("Fixture Robotics")).not.toBeInTheDocument();
});

it("restores filters and selection through browser history", async () => {
  setup(); await screen.findByText("2 results · 1 on map");
  fireEvent.click(screen.getByText("More filters"));
  fireEvent.click(screen.getByRole("button", { name: "Suppliers" }));
  fireEvent.click(screen.getByRole("button", { name: "source" }));
  fireEvent.click(within(screen.getByRole("complementary", { name: "Ecosystem listings" })).getByText("Fixture Parts"));
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("focus=fixture-parts");
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  expect(screen.queryByRole("heading", { name: "Fixture Parts" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("need=source");
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  expect(screen.getByLabelText("Current URL")).not.toHaveTextContent("need=");
  expect(screen.getByRole("button", { name: "Suppliers" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "History forward" }));
  expect(screen.getByRole("button", { name: "source" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SP Road" } });
  expect(screen.getByLabelText("Current URL")).toHaveTextContent("q=SP+Road");
});

it("shows a retryable service error without resurrecting static data", async () => {
  vi.mocked(getEcosystemListings).mockRejectedValueOnce(new Error("Synthetic service unavailable"));
  setup(); await screen.findByRole("alert");
  expect(screen.queryByText("Niqo Robotics")).not.toBeInTheDocument();
  const guide = screen.getByRole("complementary", { name: "Ecosystem listings" });
  expect(within(guide).getByRole("alert")).toHaveTextContent("Synthetic service unavailable");
  expect(guide.querySelectorAll(".atlas-card")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));
  await screen.findByText("2 results · 1 on map");
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});

it("does not silently turn an unavailable edit target into a new submission", async () => {
  setup("/ecosystem?contribute=startup&edit=removed-listing");
  await screen.findByText("This listing is no longer available. Start a new suggestion instead.");
  expect(screen.queryByLabelText("Organisation, place or resource name *")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New suggestion" }));
  expect(screen.getByLabelText("Organisation, place or resource name *")).toHaveValue("");
  expect(screen.getByLabelText("Current URL")).not.toHaveTextContent("edit=");
});

it("preserves the contribution heading focus when the parent reveals the form", async () => {
  setup(); await screen.findByText("2 results · 1 on map");
  fireEvent.click(screen.getByRole("button", { name: "Submit a startup or place" }));
  expect(screen.getByRole("heading", { name: "Submit a startup or place" })).toHaveFocus();
});

it("guards the admin route against membership-review Staff before fetching submissions", async () => {
  render(<MemoryRouter initialEntries={["/admin/ecosystem"]}><Routes><Route path="/admin/ecosystem" element={<AdminRoute><EcosystemAdminPage /></AdminRoute>} /><Route path="/dashboard" element={<h1>Member dashboard</h1>} /></Routes></MemoryRouter>);
  await screen.findByRole("heading", { name: "Member dashboard" });
  expect(getEcosystemSubmissions).not.toHaveBeenCalled();
});

it("retains native guide disclosures and scroll position when returning from a listing", async () => {
  setup(); await screen.findByText("2 results · 1 on map");
  const guide = screen.getByRole("complementary", { name: "Ecosystem listings" });
  const filters = guide.querySelector<HTMLDetailsElement>(".atlas-filter-disclosure")!;
  const reading = guide.querySelector<HTMLDetailsElement>(".atlas-guide-reading")!;
  fireEvent.click(filters.querySelector("summary")!);
  fireEvent.click(reading.querySelector("summary")!);
  expect(filters.open).toBe(true); expect(reading.open).toBe(true);
  guide.scrollTop = 180;
  fireEvent.click(within(guide).getByRole("button", { name: /^Fixture Robotics/ }));
  expect(guide).not.toBeVisible();
  expect(screen.getByRole("article", { name: "Fixture Robotics details" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Close listing details" }));
  expect(guide).toBeVisible();
  expect(filters.open).toBe(true); expect(reading.open).toBe(true);
  expect(guide.scrollTop).toBe(180);
  await waitFor(() => expect(guide).toHaveFocus());
});

it("keeps guide chapters integrated, without advertising or a premature city selector", async () => {
  setup(); await screen.findByText("2 results · 1 on map");
  const guide = screen.getByRole("complementary", { name: "Ecosystem listings" });
  expect(within(guide).getByRole("heading", { name: "Bangalore starter guide" })).toBeInTheDocument();
  expect(within(guide).getByRole("button", { name: "Work & meet" })).toHaveAttribute("aria-expanded", "true");
  expect(within(guide).getByRole("button", { name: "Build & source" })).toHaveAttribute("aria-expanded", "false");
  expect(within(guide).getByRole("button", { name: "Settle in" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/Advertising space|Advertise here|Place a bid|Ad enquiry/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: /city/i })).not.toBeInTheDocument();
});
