import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

export type PhoneDraft = { country: CountryCode; national: string };

function parse(value: string, country: CountryCode) {
  const input = value.trim();
  if (!/^\+?[0-9 ()-]+$/.test(input)) return null;
  let depth = 0;
  for (const character of input) {
    if (character === "(" && ++depth > 1) return null;
    if (character === ")" && --depth < 0) return null;
  }
  if (depth) return null;
  try {
    const number = parsePhoneNumberFromString(input, { defaultCountry: country, extract: false });
    if (!number || number.ext || !number.isPossible() || !/^\+[1-9][0-9]{7,14}$/.test(number.number)) return null;
    if (!input.startsWith("+")) {
      // A national entry must not silently acquire an inferred international prefix.
      const explicit = parsePhoneNumberFromString(`+${getCountryCallingCode(country)}${input.replace(/[ ()-]/g, "")}`, { extract: false });
      if (explicit?.number !== number.number) return null;
    }
    return number;
  } catch { return null; }
}

export function phoneDraft(value: string, defaultCountry: CountryCode = "IN"): PhoneDraft {
  const number = parse(value, defaultCountry);
  if (!number) return { country: defaultCountry, national: value };
  if (!value.trim().startsWith("+")) return { country: defaultCountry, national: number.nationalNumber };
  const country = number.country ?? (getCountryCallingCode(defaultCountry) === number.countryCallingCode ? defaultCountry : number.getPossibleCountries()[0]);
  return country ? { country, national: number.nationalNumber } : { country: defaultCountry, national: value };
}

export function canonicalPhone(draft: PhoneDraft): string | null {
  return parse(draft.national, draft.country)?.number ?? null;
}

export function formatPhone(value: string): string {
  return parse(value, "IN")?.formatInternational() ?? value;
}
