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
  it("publishes all six winning builds with their own media and source links", () => {
    expect(humanoidChallenge2026.builds).toHaveLength(6);
    expect(new Set(humanoidChallenge2026.builds.map((build) => build.slug)).size).toBe(6);
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
    const builds = within(screen.getByRole("region", { name: "The winning builds" })).getAllByRole("article");
    expect(builds).toHaveLength(6);
    expect(within(builds[0]).getByRole("heading", { level: 3 })).toHaveTextContent("A standing G1 that learned two tasks");
    expect(within(builds[0]).getByText("01")).toBeInTheDocument();
    for (const build of builds.slice(4)) expect(within(build).getByText("05 · Joint fifth place", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("06", { exact: true })).not.toBeInTheDocument();
    for (const [index, name] of ["Harsh Patil", "Aneesh Deepak Lade", "Angelo Antu", "Aditya Sharma", "Khushali Patel", "Vasanth K"].entries()) {
      expect(within(builds[index]).getByText(new RegExp(name))).toBeInTheDocument();
    }
    const stats = screen.getByRole("list", { name: "By the numbers" });
    expect(within(stats).getAllByRole("listitem")).toHaveLength(2);
    for (const label of ["160+", "participants", "6", "featured builds"]) expect(within(stats).getByText(label, { exact: true })).toBeInTheDocument();
    expect(stats).not.toHaveTextContent(/19|days from launch/);
    expect(screen.getByRole("heading", { name: "How we judged" })).toBeInTheDocument();
  });

  it("lists the hackathon on the index and the Resources hub", () => {
    render(<MemoryRouter><HackathonsPage /></MemoryRouter>);
    expect(screen.getByText("160+ participants. See the 6 winning builds.")).toBeInTheDocument();
    expect(screen.queryByText(/19 submissions|top 10/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the results →" })).toHaveAttribute("href", "/resources/hackathons/humanoid-challenge-2026");
    cleanup();
    render(<MemoryRouter initialEntries={["/resources"]}><WhitePaperPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Browse hackathons →" })).toHaveAttribute("href", "/resources/hackathons");
  });
});
