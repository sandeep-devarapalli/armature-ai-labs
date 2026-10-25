import { useEffect, useId, useRef, useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import { canonicalPhone, phoneDraft, type PhoneDraft } from "../lib/phoneNumber";
import "./PhoneNumberField.css";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries().map(country => ({ country, name: names.of(country) || country, code: getCountryCallingCode(country) }))
    .sort((a, b) => a.country === "IN" ? -1 : b.country === "IN" ? 1 : a.name.localeCompare(b.name, "en"));

export function PhoneNumberField({ defaultValue = "", label = "Mobile number", name, disabled = false, required = true, onPhoneChange }: {
    defaultValue?: string; label?: string; name?: string; disabled?: boolean; required?: boolean; onPhoneChange?: (phone: string | null) => void;
}) {
    const [draft, setDraft] = useState(() => phoneDraft(defaultValue));
    const [blurred, setBlurred] = useState(false);
    const pristine = useRef(true), input = useRef<HTMLInputElement>(null);
    const id = useId(), helpId = `${id}-help`, errorId = `${id}-error`;
    const canonical = canonicalPhone(draft);
    const invalid = Boolean(draft.national.trim() && !canonical);
    useEffect(() => { if (pristine.current) setDraft(phoneDraft(defaultValue)); }, [defaultValue]);
    useEffect(() => { input.current?.setCustomValidity(invalid ? "Check the mobile number for the selected country." : ""); }, [invalid]);
    function change(next: PhoneDraft) { pristine.current = false; setDraft(next); onPhoneChange?.(canonicalPhone(next)); }
    return <fieldset className="phone-number-field" disabled={disabled}>
        <div className="phone-number-fields">
            <label htmlFor={`${id}-country`}>Country code<select id={`${id}-country`} autoComplete="tel-country-code" value={draft.country} onChange={event => change({ ...draft, country: event.target.value as CountryCode })}>
                {countries.map(item => <option key={item.country} value={item.country}>{item.name} (+{item.code})</option>)}
            </select></label>
            <label htmlFor={id}>{label}<input ref={input} id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={draft.national} required={required} aria-describedby={`${helpId}${invalid && blurred ? ` ${errorId}` : ""}`} aria-invalid={invalid && blurred || undefined} onBlur={() => setBlurred(true)} onChange={event => change(event.target.value.trim().startsWith("+") ? phoneDraft(event.target.value, draft.country) : { ...draft, national: event.target.value })} /></label>
        </div>
        <p id={helpId} className="phone-number-help">{draft.national.trim().startsWith("+") ? "The international prefix in the number is used as entered." : `Enter the number without the country code. +${getCountryCallingCode(draft.country)} is added automatically.`}</p>
        {invalid && blurred && <p id={errorId} className="phone-number-error" role="alert">Check the number for the selected country.</p>}
        {name && <input type="hidden" name={name} value={canonical || ""} readOnly />}
    </fieldset>;
}
