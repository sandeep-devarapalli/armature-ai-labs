import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BlogArticlePage, BlogIndexPage } from "../../src/pages/BlogPages";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("published journal", () => {
  it("searches the article and restores it after clearing search", () => {
    render(<MemoryRouter><BlogIndexPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Read the article" })).toHaveAttribute("href", "/blog/model-hardware-standard/");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the journal" }), { target: { value: "unrelated" } });
    expect(screen.getByRole("status")).toHaveTextContent("No articles found");
    expect(screen.queryByRole("link", { name: "Read the article" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 article found");
    fireEvent.click(screen.getByRole("button", { name: "Engineering" }));
    expect(screen.getByRole("button", { name: "Engineering" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Read the article" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Common interface/ })).toHaveAttribute("src", "/blog-covers/mhs-common-interface.png");
    expect(document.querySelector(".mhs-cover-motion")).toBeNull();
  });

  it("shows the static cover on the article and pauses its motion", () => {
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    expect(screen.getByRole("img", { name: /shared circular connector/ })).toHaveAttribute("src", "/blog-covers/mhs-common-interface.png");
    expect(container.querySelector(".mhs-cover-art")).toHaveAttribute("data-playing", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(container.querySelector(".mhs-cover-art")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("button", { name: "Play motion" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Play motion" }));
    expect(container.querySelector(".mhs-cover-art")).toHaveAttribute("data-playing", "true");
  });

  it("keeps the cover still when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    expect(container.querySelector(".mhs-cover-art")).toHaveAttribute("data-playing", "false");
    expect(screen.getByRole("button", { name: "Still image (reduced motion)" })).toBeDisabled();
  });

  it("retains article sections, eight sources, status and research caveats without a nested shell", () => {
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    expect(container.querySelectorAll(".article-section")).toHaveLength(8);
    const references = container.querySelector("#references") as HTMLElement;
    expect(within(references).getAllByRole("link")).toHaveLength(8);
    expect(screen.getByText("Published 13 September 2026")).toBeInTheDocument();
    expect(screen.getByText(/does not imply that Armature has MHS access/)).toBeInTheDocument();
    expect(screen.getByText(/Limited research preview, with access by application/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the journal" })).toHaveAttribute("href", "/blog/");
    expect(container.querySelector("header, footer, main")).toBeNull();
  });

  it("links every contents item to an existing article section", () => {
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    const contents = screen.getByRole("navigation", { name: "Article contents" });
    for (const link of within(contents).getAllByRole("link")) {
      expect(container.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
    const hardware = within(contents).getByRole("link", { name: /From context to physical action/ });
    fireEvent.click(hardware);
    expect(hardware).toHaveAttribute("aria-current", "location");
  });
});
