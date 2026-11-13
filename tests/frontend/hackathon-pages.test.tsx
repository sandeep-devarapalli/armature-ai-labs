import { cleanup, render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { humanoidChallenge2026 } from "../../src/data/hackathons";
import { HackathonPage, HackathonsPage } from "../../src/pages/HackathonPages";
import { WhitePaperPage } from "../../src/pages/WhitePaperPage";

afterEach(cleanup);

describe("hackathon results", () => {
  it("publishes exactly the top 10 builds with their own media and source links", () => {
    expect(humanoidChallenge2026.builds).toHaveLength(10);
    expect(new Set(humanoidChallenge2026.builds.map((build) => build.slug)).size).toBe(10);
    for (const build of humanoidChallenge2026.builds) {
      expect(existsSync(path.join("public", build.image.src))).toBe(true);
      expect(build.repoUrl).toMatch(/^https:\/\/github\.com\//);
      expect(build.videoUrl).toMatch(/^https:\/\/(github\.com|youtu\.be)\//);
    }
  });

  it("renders the results page in ranked order with the brief and judging", () => {
    render(<MemoryRouter><HackathonPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: "Teach a Humanoid With Your Own Hands" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /original brief on Luma/ })).toHaveAttribute("href", "https://luma.com/784lh668");
    const builds = within(screen.getByRole("region", { name: "The top 10 builds" })).getAllByRole("article");
    expect(builds).toHaveLength(10);
    expect(within(builds[0]).getByRole("heading", { level: 3 })).toHaveTextContent("A standing G1 that learned two tasks");
    expect(within(builds[0]).getByText("01")).toBeInTheDocument();
    expect(within(builds[9]).getByText("10")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How we judged" })).toBeInTheDocument();
  });

  it("lists the hackathon on the index and the Resources hub", () => {
    render(<MemoryRouter><HackathonsPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "See the results →" })).toHaveAttribute("href", "/resources/hackathons/humanoid-challenge-2026");
    cleanup();
    render(<MemoryRouter initialEntries={["/resources"]}><WhitePaperPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Browse hackathons →" })).toHaveAttribute("href", "/resources/hackathons");
  });
});
