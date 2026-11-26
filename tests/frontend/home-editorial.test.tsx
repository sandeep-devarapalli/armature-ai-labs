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
  it("prioritises bookings and membership while keeping the lab workflow and maker desk", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    for (const name of [
      "Book the lab.", "Join the lab.", "From idea to working machine",
      "The maker desk keeps small friction small"
    ]) expect(screen.getByRole("heading", { name, level: 2 })).toBeInTheDocument();
    // The per-room programme was removed from the landing page on 17 October 2026 (owner request).
    expect(screen.queryByText(/sq ft carpet/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore on GitHub" })).toHaveAttribute("href", "https://github.com/armature-ai-labs");
    expect(screen.getByRole("link", { name: "Membership enquiries" })).toHaveAttribute("href", "/join");
    expect(screen.queryByText(/sixteen builder pods/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Contact the lab about membership and booking availability/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enquire about membership" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
    expect(screen.queryByText(/all bookable by the hour|Here you book them by the hour/)).not.toBeInTheDocument();
  });

  it("removes the fit-out gallery, model showcase and monitoring sections", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    for (const name of ["A working floor, not a club lounge", "Two floors at a glance", "Monitored, end to end"]) {
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("img", { name: /Blender design render|during fit-out/ })).not.toBeInTheDocument();
  });

  it("provides a working motion pause and resume control", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Pause Microplate stage animation" }));
    expect(screen.getByRole("button", { name: "Play Microplate stage animation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play Microplate stage animation" }));
    expect(screen.getByRole("button", { name: "Pause Microplate stage animation" })).toBeInTheDocument();
  });
});
