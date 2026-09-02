import { membershipApplicationConflictMessage } from "../../src/lib/membershipApplicationError";

describe("membership application conflict messages", () => {
  it("distinguishes pending-application and handle conflicts", () => {
    expect(membershipApplicationConflictMessage({
      code: "23505",
      message: 'duplicate key value violates unique constraint "membership_applications_one_pending"'
    })).toBe("Your membership application is already under review.");
    expect(membershipApplicationConflictMessage({
      code: "23505",
      message: 'duplicate key value violates unique constraint "profiles_handle_lower_key"'
    })).toBe("That profile handle is already in use.");
  });

  it("uses a neutral message for an unknown unique conflict", () => {
    expect(membershipApplicationConflictMessage({
      code: "23505",
      message: "duplicate key value violates an unknown constraint"
    })).toBe("Your application conflicts with an existing record. Reload the page and try again.");
    expect(membershipApplicationConflictMessage({ code: "42501" })).toBeNull();
  });
});
