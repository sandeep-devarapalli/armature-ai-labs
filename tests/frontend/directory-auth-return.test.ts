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
  it("preserves feedback destinations while server permissions still control moderation", () => {
    const target = "/resources/white-paper/robotic-actuators/feedback?document=actuator-specifications#your-feedback";
    expect(onboardingAuthReturnPath(target, true)).toBe(target);
    expect(onboardingAuthReturnPath("/admin/resource-feedback", true)).toBe("/admin/resource-feedback");
    expect(onboardingAuthReturnPath("/admin/members", true)).toBe("/onboarding");
    expect(onboardingAuthReturnPath("//evil.example/resources/white-paper/robotic-actuators/feedback", true)).toBe("/onboarding");
  });
});
