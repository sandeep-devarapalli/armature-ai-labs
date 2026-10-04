import { act, fireEvent, render } from "@testing-library/react";
import { EcosystemMap } from "../../src/components/EcosystemMap";
import { emptyEcosystemListing } from "../../src/lib/ecosystem";

const mocks = vi.hoisted(() => ({ maps: [] as any[], markers: [] as any[] }));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  NavigationControl: class {}, AttributionControl: class {},
  Map: class {
    constructor(public options: { container: HTMLElement }) { mocks.maps.push(this); }
    loaded = () => {};
    source = { setData: vi.fn() };
    addControl = vi.fn(); addSource = vi.fn(); addLayer = vi.fn(); on = vi.fn();
    resize = vi.fn(); triggerRepaint = vi.fn(); remove = vi.fn();
    setFilter = vi.fn();
    easeTo = vi.fn(); jumpTo = vi.fn(); fitBounds = vi.fn();
    once = (_event: string, callback: () => void) => { this.loaded = callback; };
    getSource = () => this.source;
    getContainer = () => ({ clientHeight: 600 });
    getCenter = () => ({ toArray: () => [77.5, 13] });
    getZoom = () => 10;
    getBearing = () => 12;
    getPitch = () => 20;
    getPadding = () => ({ top: 1, right: 2, bottom: 3, left: 4 });
  },
  Marker: class {
    constructor(public options: { element: HTMLElement }) { mocks.markers.push(this); }
    setLngLat = vi.fn().mockReturnThis(); addTo = vi.fn().mockReturnThis(); remove = vi.fn();
  }
}));

const fixture = { ...emptyEcosystemListing(), slug: "test", name: "<img src=x onerror=alert(1)>", coordinates: [77.6, 12.97] as [number, number] };
const second = { ...fixture, slug: "second", name: "Second place", coordinates: [77.65, 13] as [number, number] };
beforeEach(() => {
  mocks.maps.length = 0; mocks.markers.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => { vi.unstubAllGlobals(); });

it("keeps one map, labels the selection literally, and ignores data-only camera refreshes", () => {
  const onSelect = vi.fn();
  const view = render(<EcosystemMap entities={[fixture]} selectedSlug={null} onSelect={onSelect} />);
  const map = mocks.maps[0];
  act(() => map.loaded());
  view.rerender(<EcosystemMap entities={[fixture]} selectedSlug="test" onSelect={onSelect} />);
  expect(mocks.markers[0].options.element.querySelector(".ecosystem-marker-label").textContent).toBe(fixture.name);
  expect(mocks.markers[0].options.element.querySelector("img")).toBeNull();
  expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: fixture.coordinates, padding: { top: 52, right: 52, bottom: 52, left: 532 } }));
  view.rerender(<EcosystemMap entities={[{ ...fixture, summary: "Refreshed source details" }]} selectedSlug="test" onSelect={onSelect} />);
  expect(map.easeTo).toHaveBeenCalledTimes(1);
  expect(mocks.maps).toHaveLength(1);
  expect(map.addControl.mock.calls.map((call: unknown[]) => call[1])).toEqual(["bottom-right", "bottom-left"]);
});

it("restores the original camera after multiple selections and removes the label", () => {
  const onSelect = vi.fn();
  const view = render(<EcosystemMap entities={[fixture, second]} selectedSlug={null} onSelect={onSelect} />);
  const map = mocks.maps[0]; act(() => map.loaded());
  view.rerender(<EcosystemMap entities={[fixture, second]} selectedSlug="test" onSelect={onSelect} />);
  view.rerender(<EcosystemMap entities={[fixture, second]} selectedSlug="second" onSelect={onSelect} />);
  view.rerender(<EcosystemMap entities={[fixture, second]} selectedSlug={null} onSelect={onSelect} />);
  expect(map.easeTo).toHaveBeenLastCalledWith({ center: [77.5, 13], zoom: 10, bearing: 12, pitch: 20, padding: { top: 1, right: 2, bottom: 3, left: 4 }, duration: 380 });
  expect(mocks.markers.every(marker => marker.remove.mock.calls.length === 1)).toBe(true);
});

it("clears room for the mobile sheet without animating reduced-motion selections", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(<EcosystemMap entities={[fixture]} selectedSlug="test" onSelect={vi.fn()} />);
  const map = mocks.maps[0]; act(() => map.loaded());
  expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ padding: { top: 180, right: 28, bottom: 308, left: 28 } }));
  expect(map.easeTo).not.toHaveBeenCalled();
});

it("never creates a marker or inferred camera target for unpinned listings", () => {
  render(<EcosystemMap entities={[{ ...fixture, coordinates: undefined }]} selectedSlug="test" onSelect={vi.fn()} />);
  const map = mocks.maps[0]; act(() => map.loaded());
  expect(mocks.markers).toHaveLength(0);
  expect(map.easeTo).not.toHaveBeenCalled();
  expect(map.jumpTo).not.toHaveBeenCalled();
});

it("anchors the favicon pin at the location and retains a fallback until the local icon loads", () => {
  const entity = { ...fixture, websiteUrl: "https://armatureailabs.com/" };
  const view = render(<EcosystemMap entities={[entity]} selectedSlug="test" onSelect={vi.fn()} />);
  const map = mocks.maps[0]; act(() => map.loaded());
  const marker = mocks.markers[0];
  expect(marker.options).toMatchObject({ anchor: "bottom", offset: [0, 0] });
  expect(marker.setLngLat).toHaveBeenCalledWith(fixture.coordinates);
  const element = marker.options.element as HTMLElement;
  expect(element).toHaveAccessibleName(`Selected place: ${fixture.name}`);
  const icon = element.querySelector("img")!;
  const fallback = element.querySelector<HTMLElement>(".ecosystem-pin-fallback")!;
  expect(icon.getAttribute("src")).toBe("/brand/editorial-2026-09/logos/icon-dark-48.svg");
  expect(icon.hidden).toBe(true);
  expect(fallback.hidden).toBe(false);
  fireEvent.load(icon);
  expect(icon.hidden).toBe(false);
  expect(fallback.hidden).toBe(true);
  expect(map.setFilter).toHaveBeenLastCalledWith("ecosystem-points", ["all", ["!", ["has", "point_count"]], ["!=", ["get", "slug"], "test"]]);
  view.unmount();
  expect(marker.remove).toHaveBeenCalledOnce();
});

it("removes broken icons and keeps the neutral fallback", () => {
  render(<EcosystemMap entities={[{ ...fixture, websiteUrl: "https://www.armatureailabs.com/" }]} selectedSlug="test" onSelect={vi.fn()} />);
  act(() => mocks.maps[0].loaded());
  const element = mocks.markers[0].options.element as HTMLElement;
  fireEvent.error(element.querySelector("img")!);
  expect(element.querySelector("img")).toBeNull();
  expect(element.querySelector<HTMLElement>(".ecosystem-pin-fallback")!.hidden).toBe(false);
});

it.each(["https://example.com", "https://armatureailabs.com.evil.test", "javascript:alert(1)", "not a URL", "http://armatureailabs.com", "https://user:secret@armatureailabs.com"])("never requests an unapproved favicon: %s", websiteUrl => {
  render(<EcosystemMap entities={[{ ...fixture, websiteUrl }]} selectedSlug="test" onSelect={vi.fn()} />);
  act(() => mocks.maps[0].loaded());
  expect(mocks.markers[0].options.element.querySelector("img")).toBeNull();
});
