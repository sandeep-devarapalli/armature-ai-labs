import { act } from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { Providers } from "../../src/app/Providers";
import { useApp } from "../../src/context/AppContext";
import { useInventory } from "../../src/context/InventoryContext";
import { useTheme } from "../../src/context/ThemeContext";
import { initialDemoState } from "../../src/data/demo";
import { initialInventoryState, INVENTORY_STORAGE_KEY } from "../../src/data/inventoryDemo";
import { makerServicesDemoState, MAKER_SERVICES_STORAGE_KEY } from "../../src/data/makerServices";

vi.mock("../../src/lib/supabase", () => ({
  dataMode: "demo",
  isSupabaseConfigured: false,
  supabase: null
}));

function Snapshot() {
  const { currentMember, state, online } = useApp();
  const { inventory, makerServices } = useInventory();
  const { theme } = useTheme();
  return <div>
    <span data-testid="member">{currentMember?.name ?? "Anonymous"}</span>
    <span data-testid="bookings">{state.bookings.length}</span>
    <span data-testid="requests">{inventory.requests.length}</span>
    <span data-testid="orders">{makerServices.consumableOrders.length}</span>
    <span data-testid="theme">{theme}</span>
    <span data-testid="online">{String(online)}</span>
  </div>;
}

it("hydrates an anonymous snapshot before restoring local preferences and demo state", async () => {
  const savedState = { ...initialDemoState, currentUserId: "member-demo" };
  window.localStorage.setItem("armature-demo-state-v1", JSON.stringify(savedState));
  window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(initialInventoryState));
  window.localStorage.setItem(MAKER_SERVICES_STORAGE_KEY, JSON.stringify(makerServicesDemoState));
  window.localStorage.setItem("armature-theme", "sepia");
  const storageWrites = vi.spyOn(window.localStorage, "setItem");
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const app = <StrictMode><Providers hydrate><Snapshot /></Providers></StrictMode>;
  const container = document.createElement("div");
  container.innerHTML = renderToString(app);
  document.body.append(container);
  const text = (key: string) => container.querySelector(`[data-testid="${key}"]`)?.textContent;
  expect(text("member")).toBe("Anonymous");
  expect(text("bookings")).toBe("0");
  expect(text("requests")).toBe("0");
  expect(text("theme")).toBe("dark");
  const errors: unknown[] = [];
  let root: Root | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, app, { onRecoverableError: (error) => errors.push(error) }); });
    expect(text("member")).toBe("Anika Rao");
    expect(text("bookings")).toBe(String(savedState.bookings.length));
    expect(text("requests")).toBe(String(initialInventoryState.requests.length));
    expect(text("orders")).toBe(String(makerServicesDemoState.consumableOrders.length));
    expect(text("theme")).toBe("sepia");
    expect(text("online")).toBe("false");
    expect(errors).toEqual([]);
    expect(storageWrites.mock.calls.filter(([key]) => key === "armature-demo-state-v1")
      .every(([, value]) => JSON.parse(value).currentUserId === "member-demo")).toBe(true);
    expect(window.localStorage.getItem(INVENTORY_STORAGE_KEY)).toBe(JSON.stringify(initialInventoryState));
    expect(window.localStorage.getItem(MAKER_SERVICES_STORAGE_KEY)).toBe(JSON.stringify(makerServicesDemoState));
    expect(window.localStorage.getItem("armature-theme")).toBe("sepia");
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    online.mockRestore();
    storageWrites.mockRestore();
    window.localStorage.clear();
  }
});
