import { describe, expect, it } from "vitest";
import { canonicalPhone, formatPhone, phoneDraft } from "../../src/lib/phoneNumber";
import type { CountryCode } from "libphonenumber-js/min";

describe("phone entry and canonical payloads", () => {
  it.each(["9876543210", "+919876543210", "+91 98765 43210", "+91 (98765) 43210"])("normalizes India entry %s without duplicating its prefix", value => {
    expect(phoneDraft(value)).toEqual({ country: "IN", national: "9876543210" });
    expect(canonicalPhone(phoneDraft(value))).toBe("+919876543210");
  });

  it("uses an explicit country for national input and preserves Italy's significant zero", () => {
    expect(canonicalPhone({ country: "GB", national: "020 7946 0018" })).toBe("+442079460018");
    expect(phoneDraft("020 7946 0018", "GB")).toEqual({ country: "GB", national: "2079460018" });
    expect(phoneDraft("+39 02 1234 5678")).toEqual({ country: "IT", national: "0212345678" });
    expect(canonicalPhone({ country: "IT", national: "02 1234 5678" })).toBe("+390212345678");
  });

  it("parses a pasted international prefix before applying the selected country", () => {
    expect(phoneDraft("+44 20 7946 0018")).toEqual({ country: "GB", national: "2079460018" });
    expect(canonicalPhone({ country: "IN", national: "+44 20 7946 0018" })).toBe("+442079460018");
    expect(canonicalPhone(phoneDraft("+44 (0)20 7946 0018"))).toBe("+442079460018");
  });

  it("resolves known shared-code territories and retains a matching selection when ambiguous", () => {
    expect(phoneDraft("+1 204 555 1234").country).toBe("CA");
    expect(phoneDraft("+1 213 373 4253").country).toBe("US");
    expect(phoneDraft("+1 222 333 3333", "CA")).toEqual({ country: "CA", national: "2223333333" });
    expect(canonicalPhone(phoneDraft("+1 222 333 3333", "CA"))).toBe("+12223333333");
    expect(phoneDraft("+44 7700 900123").country).toBe("GB");
  });

  it.each(["919876543210", "00919876543210"])("does not guess a missing plus for ambiguous legacy entry %s", value => {
    expect(phoneDraft(value)).toEqual({ country: "IN", national: value });
    expect(canonicalPhone(phoneDraft(value))).toBeNull();
    expect(formatPhone(value)).toBe(value);
  });

  it("does not infer a foreign country code from a bare national entry", () => {
    expect(phoneDraft("442079460018")).toEqual({ country: "IN", national: "442079460018" });
    expect(canonicalPhone(phoneDraft("442079460018"))).toBe("+91442079460018");
  });

  it.each(["", " ", "+", "++919876543210", "+91+9876543210", "+91 9876543210 ext 3", "+91 9876543210;ext=3", "+91 9876543210#3", "Call +919876543210", "+91 98765A3210", "+91 (9876543210", "+91 9876543210)", "+91 ((98765))43210", "+91\n9876543210", "+9999876543210", "+123", "+1234567890123456"])("preserves and rejects malformed or impossible entry %j", value => {
    expect(phoneDraft(value).national).toBe(value);
    expect(canonicalPhone(phoneDraft(value))).toBeNull();
    expect(formatPhone(value)).toBe(value);
  });

  it("keeps non-geographic international numbers explicit rather than giving them an Indian prefix", () => {
    const value = "+80012345678";
    expect(phoneDraft(value)).toEqual({ country: "IN", national: value });
    expect(canonicalPhone(phoneDraft(value))).toBe(value);
  });

  it("uses possibility checks without claiming a number is allocated or SMS-capable", () => {
    expect(canonicalPhone({ country: "US", national: "2223333333" })).toBe("+12223333333");
    expect(canonicalPhone({ country: "IN", national: "123" })).toBeNull();
    expect(canonicalPhone({ country: "GB", national: "123456789012345" })).toBeNull();
    expect(canonicalPhone({ country: "ZZ" as CountryCode, national: "9876543210" })).toBeNull();
  });

  it("enforces the server's eight-digit minimum even for a shorter possible national plan", () => {
    expect(canonicalPhone(phoneDraft("+6831234"))).toBeNull();
    expect(phoneDraft("+6831234").national).toBe("+6831234");
    expect(canonicalPhone(phoneDraft("+29021234"))).toBe("+29021234");
  });

  it("formats only possible numbers for human review", () => {
    expect(formatPhone("9876543210")).toBe("+91 98765 43210");
    expect(formatPhone("+442079460018")).toBe("+44 20 7946 0018");
    expect(formatPhone("+390212345678")).toBe("+39 02 1234 5678");
  });
});
