import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "../../src/context/ThemeContext";

function ThemeHarness() {
  const { theme, setTheme } = useTheme();
  return <>
    <output>{theme}</output>
    <button onClick={() => setTheme("light")}>Light</button>
  </>;
}

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#111110">';
  document.documentElement.dataset.theme = "dark";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([null, "invalid"])("defaults to dark with preference %s, even on a light system", (saved) => {
  if (saved !== null) window.localStorage.setItem("armature-theme", saved);
  expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
  render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("dark");
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", "#111110");
});

it.each(["light", "dark", "sepia"])("retains a saved %s preference", (saved) => {
  window.localStorage.setItem("armature-theme", saved);
  render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
  expect(screen.getByRole("status")).toHaveTextContent(saved);
  expect(window.localStorage.getItem("armature-theme")).toBe(saved);
});

it("keeps theme selection usable when storage reads and writes fail", async () => {
  vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("dark");
  await userEvent.click(screen.getByRole("button", { name: "Light" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", "#ffffff");
});

it("survives an unavailable localStorage property", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => { throw new Error("Blocked"); }
  });
  try {
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("dark");
  } finally {
    Object.defineProperty(window, "localStorage", descriptor);
  }
});
