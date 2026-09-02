import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addMinutes } from "date-fns";
import { useState } from "react";
import { AppProvider, useApp } from "../../src/context/AppContext";
import { InventoryProvider, useInventory } from "../../src/context/InventoryContext";
import { ThemeProvider, useTheme } from "../../src/context/ThemeContext";
import { componentOffers, components } from "../../src/data/components";
import { initialDemoState } from "../../src/data/demo";

vi.mock("../../src/lib/supabase", () => ({
  dataMode: "demo",
  isSupabaseConfigured: false,
  supabase: null
}));

function ThemeHarness() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <output>{theme}</output>
      <button type="button" onClick={() => setTheme("sepia")}>Sepia</button>
    </>
  );
}

function BookingHarness() {
  const { currentMember, signInDemo, state, createBooking } = useApp();
  const [error, setError] = useState("");
  const start = addMinutes(new Date(), 45).toISOString();
  return (
    <>
      <output>{currentMember?.name ?? "signed out"}</output>
      <output data-testid="count">{state.bookings.length}</output>
      <output data-testid="error">{error}</output>
      <button type="button" onClick={signInDemo}>Sign in</button>
      <button
        type="button"
        onClick={async () => {
          try {
            await createBooking({
              resourceId: "res-gpu",
              startsAt: start,
              durationMinutes: 60,
              purpose: "Test the local booking ledger",
              guestNames: []
            });
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "failed");
          }
        }}
      >
        Book
      </button>
    </>
  );
}

function ApplicationHarness() {
  const { currentMember, state, submitApplication } = useApp();
  const [error, setError] = useState("");
  const application = state.applications.find((item) => item.memberId === currentMember?.id);
  return (
    <>
      <output data-testid="applicant-name">{currentMember?.name}</output>
      <output data-testid="applicant-handle">{currentMember?.handle}</output>
      <output data-testid="application-state">{application?.state ?? "none"}</output>
      <output data-testid="application-error">{error}</output>
      <button
        type="button"
        onClick={() => void submitApplication({
          name: "New Member",
          handle: "new-member",
          summary: "A modular mobile robot for indoor mapping."
        }).catch((reason: Error) => setError(reason.message))}
      >
        Apply
      </button>
    </>
  );
}

function InventoryHarness() {
  const { currentMember, signInDemo } = useApp();
  const {
    inventory,
    voteForRequest,
    createCheckout,
    scanCheckoutItem,
    completeCheckout,
    returnAsset
  } = useInventory();
  const [error, setError] = useState("");
  const asset = inventory.assets.find((item) => item.assetTag === "ARM-SEN-000123");
  const request = inventory.requests.find((item) => item.id === "request-force-sensor");

  async function checkout() {
    setError("");
    try {
      const session = await createCheckout("Unit test checkout");
      await scanCheckoutItem(session.id, "ARM-SEN-000123");
      await completeCheckout(session.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "failed");
    }
  }

  async function returnItem() {
    const session = inventory.checkoutSessions.find(
      (item) => item.memberId === currentMember?.id && item.state === "open"
    );
    if (!session) return;
    await returnAsset(session.id, "ARM-SEN-000123", "good");
  }

  return (
    <>
      <output>{currentMember?.name ?? "signed out"}</output>
      <output data-testid="votes">{request?.voteCount}</output>
      <output data-testid="asset-state">{asset?.state}</output>
      <output data-testid="inventory-error">{error}</output>
      <button type="button" onClick={signInDemo}>Sign in</button>
      <button type="button" onClick={() => void voteForRequest("request-force-sensor").catch((reason: Error) => setError(reason.message))}>Vote</button>
      <button type="button" onClick={() => void checkout()}>Checkout asset</button>
      <button type="button" onClick={() => void returnItem()}>Return asset</button>
    </>
  );
}

function MakerDeskHarness() {
  const { signInDemo } = useApp();
  const {
    makerServices,
    releaseLocker,
    requestLocker,
    submitConsumableOrder,
    rentToolkit,
    returnToolkit
  } = useInventory();
  const currentLocker = makerServices.lockerAssignments.find((assignment) =>
    ["reserved", "active", "expiring"].includes(assignment.state)
  );
  const openToolkit = makerServices.toolkitRentals.find((rental) =>
    ["reserved", "checked_out", "overdue"].includes(rental.state)
  );

  return (
    <>
      <output data-testid="locker-state">{currentLocker?.state ?? "none"}</output>
      <output data-testid="maker-orders">{makerServices.consumableOrders.length}</output>
      <output data-testid="toolkit-state">{openToolkit?.state ?? "none"}</output>
      <button type="button" onClick={signInDemo}>Sign in</button>
      <button type="button" onClick={() => currentLocker && void releaseLocker(currentLocker.id)}>Release locker</button>
      <button type="button" onClick={() => void requestLocker("small-parts-locker", "week")}>Request locker</button>
      <button type="button" onClick={() => void submitConsumableOrder([{
        consumableSlug: "metric-screw-assortment",
        quantity: 2,
        unit: "assorted pack"
      }])}>Order parts</button>
      <button type="button" onClick={() => void rentToolkit("electronics-bench-kit", "session")}>Rent toolkit</button>
      <button type="button" onClick={() => openToolkit && void returnToolkit(openToolkit.id, "good")}>Return toolkit</button>
    </>
  );
}

describe("frontend foundation", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists the explicit three-mode theme choice", async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
    expect(screen.getByText("light")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sepia" }));
    expect(screen.getByText("sepia")).toBeInTheDocument();
    expect(window.localStorage.getItem("armature-theme")).toBe("sepia");
    expect(document.documentElement.dataset.theme).toBe("sepia");
  });

  it("runs a local member sign-in and conflict-checked booking", async () => {
    const user = userEvent.setup();
    render(<AppProvider><BookingHarness /></AppProvider>);
    const initial = Number(screen.getByTestId("count").textContent);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Anika Rao")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByTestId("count")).toHaveTextContent(String(initial + 1));
    await user.click(screen.getByRole("button", { name: "Book" }));
    expect(screen.getByTestId("error")).toHaveTextContent("overlaps");
  });

  it("completes an empty member profile with the application and prevents a duplicate", async () => {
    const user = userEvent.setup();
    const applicantState = JSON.parse(JSON.stringify(initialDemoState));
    applicantState.currentUserId = "member-pending";
    applicantState.applications = [];
    applicantState.profiles = applicantState.profiles.map((profile: { id: string; name: string; handle: string }) =>
      profile.id === "member-pending" ? { ...profile, name: "", handle: "" } : profile
    );
    window.localStorage.setItem("armature-demo-state-v1", JSON.stringify(applicantState));

    render(<AppProvider><ApplicationHarness /></AppProvider>);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByTestId("applicant-name")).toHaveTextContent("New Member");
    expect(screen.getByTestId("applicant-handle")).toHaveTextContent("new-member");
    expect(screen.getByTestId("application-state")).toHaveTextContent("pending");

    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByTestId("application-error")).toHaveTextContent("already under review");
  });

  it("enforces one member vote per component request", async () => {
    const user = userEvent.setup();
    render(<AppProvider><InventoryProvider><InventoryHarness /></InventoryProvider></AppProvider>);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByTestId("votes")).toHaveTextContent("7");
    await user.click(screen.getByRole("button", { name: "Vote" }));
    expect(screen.getByTestId("votes")).toHaveTextContent("8");
    await user.click(screen.getByRole("button", { name: "Vote" }));
    expect(screen.getByTestId("inventory-error")).toHaveTextContent("already voted");
  });

  it("checks out one serialized asset and returns it to availability", async () => {
    const user = userEvent.setup();
    render(<AppProvider><InventoryProvider><InventoryHarness /></InventoryProvider></AppProvider>);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(screen.getByRole("button", { name: "Checkout asset" }));
    expect(screen.getByTestId("asset-state")).toHaveTextContent("checked_out");
    await user.click(screen.getByRole("button", { name: "Checkout asset" }));
    expect(screen.getByTestId("inventory-error")).toHaveTextContent("not available");
    await user.click(screen.getByRole("button", { name: "Return asset" }));
    expect(screen.getByTestId("asset-state")).toHaveTextContent("available");
  });

  it("runs locker, consumable, and toolkit maker-desk flows", async () => {
    const user = userEvent.setup();
    render(<AppProvider><InventoryProvider><MakerDeskHarness /></InventoryProvider></AppProvider>);
    const initialOrders = Number(screen.getByTestId("maker-orders").textContent);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(screen.getByRole("button", { name: "Release locker" }));
    expect(screen.getByTestId("locker-state")).toHaveTextContent("none");
    await user.click(screen.getByRole("button", { name: "Request locker" }));
    expect(screen.getByTestId("locker-state")).toHaveTextContent("reserved");
    await user.click(screen.getByRole("button", { name: "Order parts" }));
    expect(screen.getByTestId("maker-orders")).toHaveTextContent(String(initialOrders + 1));
    await user.click(screen.getByRole("button", { name: "Rent toolkit" }));
    expect(screen.getByTestId("toolkit-state")).toHaveTextContent("checked_out");
    await user.click(screen.getByRole("button", { name: "Return toolkit" }));
    expect(screen.getByTestId("toolkit-state")).toHaveTextContent("none");
  });

  it("keeps a three-printer fabrication fleet tied to dated Amazon offers", () => {
    const printerSlugs = new Set([
      "bambu-lab-a1",
      "bambu-lab-p1s-combo",
      "elegoo-neptune-4-plus"
    ]);
    const printers = components.filter((component) => printerSlugs.has(component.slug));
    const offers = componentOffers.filter((offer) => printerSlugs.has(offer.componentSlug));

    expect(printers.reduce((total, printer) => total + printer.quantityTarget, 0)).toBe(3);
    expect(offers).toHaveLength(3);
    expect(offers.every((offer) =>
      offer.vendor === "Amazon.in"
      && offer.sku?.startsWith("ASIN ")
      && offer.customerRating !== undefined
      && offer.customerRatingCount !== undefined
    )).toBe(true);
  });
});
