import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../../src/pages/HomePage";

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Full editorial landing page", () => {
  it("retains the six operational sections, current rooms and public destinations", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    for (const name of [
      "A working floor, not a club lounge", "Two floors at a glance",
      "Monitored, end to end", "From idea to working machine",
      "The maker desk keeps small friction small", "Book, build, and leave a clean trail"
    ]) expect(screen.getByRole("heading", { name, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/9 rooms · 1,550 sq ft carpet/)).toBeInTheDocument();
    expect(screen.getByText(/6 rooms · 1,475 sq ft carpet/)).toBeInTheDocument();
    expect(screen.getByText("Glass-enclosed workshop proposal · curved balcony retained")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join Discord" })).toHaveAttribute("href", "https://discord.gg/qGNXGmF8z");
    expect(screen.getByRole("link", { name: "Join the floor" })).toHaveAttribute("href", "/join");
    expect(screen.queryByText(/sixteen builder pods/i)).not.toBeInTheDocument();
  });

  it("shows only the four selected current model renders, lazily loaded", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const renders = screen.getAllByRole("img", { name: /Blender design render/ });
    expect(renders).toHaveLength(4);
    for (const image of renders) expect(image).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("link", { name: "Explore First floor models" })).toHaveAttribute("href", "/building-vision/#first-floor-overview");
    expect(screen.getByText(/not photographs of completed spaces/)).toBeInTheDocument();
  });

  it("provides a working motion pause and resume control", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(screen.getByRole("button", { name: "Play motion" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play motion" }));
    expect(screen.getByRole("button", { name: "Pause motion" })).toBeInTheDocument();
  });
});
