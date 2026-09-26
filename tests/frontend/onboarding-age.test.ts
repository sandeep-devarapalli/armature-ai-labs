import { getAgeOnDate } from "../../src/lib/onboarding";

describe("onboarding age boundaries", () => {
  it.each([["2010-09-27",15],["2010-09-26",16],["2008-09-27",17],["2008-09-26",18]])("calculates age for %s", (birth, age) => {
    expect(getAgeOnDate(birth as string, "2026-09-26")).toBe(age);
  });
  it("handles leap-day birthdays using calendar comparison", () => {
    expect(getAgeOnDate("2008-02-29", "2026-02-28")).toBe(17);
    expect(getAgeOnDate("2008-02-29", "2026-03-01")).toBe(18);
  });
  it.each(["2025-02-29", "2010-13-01", "2010-9-01", "2027-01-01"])("rejects invalid or future birth date %s", birth => {
    expect(() => getAgeOnDate(birth, "2026-09-26")).toThrow(RangeError);
  });
  it("validates the comparison date", () => {
    expect(() => getAgeOnDate("2010-09-26", "2026-02-30")).toThrow(RangeError);
  });
});
