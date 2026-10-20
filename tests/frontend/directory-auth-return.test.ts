import { describe, expect, it } from "vitest";
import { onboardingAuthReturnPath } from "../../src/lib/authReturnPath";

describe("public directory settings sign-in return", () => {
  it("lets Basic members return to their own public profile settings", () => {
    expect(onboardingAuthReturnPath("/directory-profile", true)).toBe("/directory-profile");
    expect(onboardingAuthReturnPath("/directory-profile/", true)).toBe("/directory-profile/");
  });
  it("does not open gated workspace or external destinations", () => {
    expect(onboardingAuthReturnPath("/profile", true)).toBe("/onboarding");
    expect(onboardingAuthReturnPath("https://other.example/directory-profile", true)).toBe("/onboarding");
  });
});
