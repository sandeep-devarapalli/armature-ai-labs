import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandingPage } from "../../src/pages/BrandingPage";
import manifest from "../../public/brand/editorial-2026-09/manifest.json";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editorial brand resources", () => {
  it("links real complete, logo and social archives plus a preserved permissions note", () => {
    const { container } = render(<BrandingPage />);
    const downloads = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[download]"));
    expect(downloads.length).toBeGreaterThan(45);
    for (const link of downloads) {
      expect(link.getAttribute("download")).toBeTruthy();
      expect(existsSync(resolve("public", "." + link.getAttribute("href")))).toBe(true);
    }
    expect(screen.getByRole("link", { name: "Download complete pack" })).toHaveAttribute("download", "armature-ai-labs-editorial-complete.zip");
    expect(screen.getByRole("link", { name: "All logo files" })).toHaveAttribute("href", "/brand/editorial-2026-09/armature-ai-labs-editorial-logos.zip");
    expect(screen.getByRole("link", { name: "All social files" })).toHaveAttribute("href", "/brand/editorial-2026-09/armature-ai-labs-editorial-social.zip");
    expect(screen.getByText(/Any other use requires prior written permission/)).toBeInTheDocument();
  });

  it("selects 512 px dark icons and changes sizes without inventing filenames", () => {
    render(<BrandingPage />);
    fireEvent.click(within(screen.getByRole("group", { name: "Asset background" })).getByRole("button", { name: "For dark surfaces" }));
    expect(screen.getByRole("link", { name: "App, profile and browser icons dark 512 px · PNG" })).toHaveAttribute("href", "/brand/editorial-2026-09/logos/icon-dark-512.png");
    fireEvent.change(screen.getByRole("combobox", { name: "App, profile and browser icons export size" }), { target: { value: "32-solid" } });
    expect(screen.getByRole("link", { name: "App, profile and browser icons dark 32 px · SVG" })).toHaveAttribute("href", "/brand/editorial-2026-09/logos/icon-dark-32.svg");
    expect(screen.getByRole("link", { name: "LinkedIn Company cover dark · PNG" })).toHaveAttribute("href", "/brand/editorial-2026-09/social/linkedin/company-cover-dark-1512x256.png");
    expect(screen.getByRole("link", { name: "WhatsApp Business Status dark · PNG" })).toBeInTheDocument();
  });

  it("copies the manifest descriptions with explicit feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<BrandingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Copy one-line description" }));
    expect(await screen.findByText("Description copied to the clipboard.")).toBeInTheDocument();
    expect(writeText).toHaveBeenLastCalledWith(manifest.copy.oneLine);
    fireEvent.click(screen.getByRole("button", { name: "Copy one-paragraph description" }));
    expect(writeText).toHaveBeenLastCalledWith(manifest.copy.paragraph);
  });

  it("uses corrected casing and monochrome typography guidance", () => {
    render(<BrandingPage />);
    expect(screen.getByRole("heading", { name: "Helvetica Neue + Space Mono" })).toBeInTheDocument();
    expect(screen.getByText("Retain the exact capitals: Armature AI Labs.")).toBeInTheDocument();
    expect(screen.queryByText(/lowercase wordmark/)).not.toBeInTheDocument();
    for (const platform of ["LinkedIn", "X / Twitter", "Instagram", "GitHub", "YouTube", "Discord", "WhatsApp Business"]) {
      expect(screen.getByRole("heading", { name: platform })).toBeInTheDocument();
    }
  });
});
