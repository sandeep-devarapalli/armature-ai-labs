import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BlogArticlePage, BlogIndexPage } from "../../src/pages/BlogPages";

afterEach(cleanup);

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
  });

  it("retains article sections, eight sources, status and research caveats without a nested shell", () => {
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    expect(container.querySelectorAll(".article-section")).toHaveLength(10);
    const references = container.querySelector("#references") as HTMLElement;
    expect(within(references).getAllByRole("link")).toHaveLength(8);
    expect(screen.getByText("Published 13 September 2026 · Updated 17 September 2026")).toBeInTheDocument();
    expect(screen.getByText(/does not imply that Armature has MHS access/)).toBeInTheDocument();
    expect(screen.getByText(/Limited research preview, with access by application/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the journal" })).toHaveAttribute("href", "/blog/");
    expect(container.querySelector("header, footer, main")).toBeNull();
  });

  it("presents engineering workflows as proposals and connects evidence to reviewed design changes", () => {
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    const useCases = container.querySelector("#where-engineering-ai-meets-the-test-bench") as HTMLElement;
    expect(within(useCases).getByText(/possible applications, not turnkey MHS features/)).toBeInTheDocument();
    for (const label of ["Hardware-in-the-loop testing.", "Physical component testing.", "Mechatronic system validation."]) {
      expect(within(useCases).getByText(label)).toBeInTheDocument();
    }
    expect(within(useCases).getByText(/Timing-critical control and protective interlocks/)).toBeInTheDocument();
    expect(screen.getByText("Design → Simulation → Physical Test → Learn → Redesign")).toBeInTheDocument();
    expect(screen.getByText(/A requirement should not be relaxed merely to make a failed test pass/)).toBeInTheDocument();
  });

  it("loads the accessible video only after activation and preserves a YouTube fallback", () => {
    const { container } = render(<MemoryRouter><BlogArticlePage /></MemoryRouter>);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("img", { name: /Thumbnail for Anthropic’s video/ })).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=P1zBiAQU1IA");
    fireEvent.click(screen.getByRole("button", { name: /^Play video:/ }));
    const player = screen.getByTitle("AI models can now help run physical science experiments — Anthropic, YouTube video");
    expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/P1zBiAQU1IA?autoplay=1&playsinline=1&cc_load_policy=1");
    expect(player).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    expect(player).toHaveAttribute("allowfullscreen");
    expect(player).toHaveFocus();
    expect(screen.queryByRole("button", { name: /^Play video:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Watch on YouTube/ })).toBeInTheDocument();
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
