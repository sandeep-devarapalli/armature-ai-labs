import { catalogue, formatPaise, type Bookable } from "../bookings/catalogue";
import { cabinRent, type Cabin } from "../bookings/cabins";

// The cabin flow for one chosen cabin: its own monthly rent; the deposit amount is still to be confirmed.
export function cabinBookable(cabin: Cabin): Bookable {
  const base = catalogue.find(i => i.id === "cabin")!;
  return {
    ...base,
    name: cabin.name,
    cabin: cabin.code,
    summary: `${cabin.billable} billable seats, room for ${cabin.billable + cabin.extra}. ${formatPaise(cabinRent(cabin))} a month.`,
    options: [{ id: "month", label: "Monthly rent", paise: cabinRent(cabin), per: "calendar month" }]
  };
}
