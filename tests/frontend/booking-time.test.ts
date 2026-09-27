import { describe, expect, it } from "vitest";
import { labDateTimeInput, labInstant } from "../../src/lib/bookingTime";
describe("lab booking time", () => {
  it("uses India time independently of the browser timezone", () => {
    expect(labInstant("2026-10-01T09:00").toISOString()).toBe("2026-10-01T03:30:00.000Z");
    expect(labDateTimeInput(new Date("2026-10-01T17:30:00Z"))).toBe("2026-10-01T23:00");
  });
  it("rejects normalized invalid dates and caller-supplied timezone suffixes", () => {
    for (const value of ["2026-02-30T09:00", "2026-10-01T24:00", "2026-10-01T09:00Z", ""]) expect(() => labInstant(value)).toThrow();
  });
});
