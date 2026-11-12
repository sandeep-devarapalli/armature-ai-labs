import { catalogue, formatPaise, type Bookable, type PriceOption } from "../bookings/catalogue";
import type { EquipmentListing } from "../bookings/equipment";

// The rental flow for one equipment item: its own prices and deposit, and no deposit step when there is none.
export function equipmentBookable(e: EquipmentListing): Bookable {
  const kit = catalogue.find(i => i.id === "kit")!;
  const options: PriceOption[] = [
    e.dayPaise !== undefined ? { id: "day", label: "1 day", paise: e.dayPaise, per: "day" } : null,
    e.weekPaise !== null ? { id: "week", label: "7 days", paise: e.weekPaise, per: "7 days" } : null,
    e.monthPaise !== null ? { id: "month", label: "30 days", paise: e.monthPaise, per: "30 days" } : null
  ].filter((o): o is PriceOption => !!o);
  const deposit = e.depositPaise ?? 0;
  return {
    ...kit,
    name: `${e.maker} ${e.name}`,
    summary: e.summary,
    options,
    depositPaise: deposit || undefined,
    depositLabel: deposit ? `${formatPaise(deposit)}, refundable` : "None",
    depositNote: deposit ? `Refundable security deposit of ${formatPaise(deposit)}, paid by bank transfer. Returned within 7 working days of the return.` : undefined,
    minimum: options[0] ? options[0].label : kit.minimum,
    steps: kit.steps.filter(s => deposit || s.id !== "deposit")
      .map(s => s.id === "choose" ? { ...s, detail: `Pick ${options.map(o => o.label).join(", ")} and a start date.` } : s)
  };
}
