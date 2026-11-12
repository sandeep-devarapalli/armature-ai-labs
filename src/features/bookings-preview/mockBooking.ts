import { useState } from "react";
import type { Bookable } from "../bookings/catalogue";

// Local preview only: fake availability and state, no network calls.

export type Choice = {
  optionId: string;
  start: string;
  chair: string;
  startTime: string;
  hours: number;
  attendees: number;
  purpose: string;
};

export type Flow = {
  stepIndex: number;
  choice: Choice;
  accepted: boolean;
  approved: boolean;
  agreement: "preparing" | "ready" | "signed" | "countersigned";
  refundAccount: boolean;
  depositReference: string;
  depositVerified: boolean;
  paid: boolean;
  reference: string;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (days: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return iso(d); };

export const mockDates = (count = 21) => Array.from({ length: count }, (_, i) => {
  const date = addDays(i + 1);
  return { date, available: (i + 2) % 6 !== 0 };
});
export const mockChairs = Array.from({ length: 25 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`).filter((_, i) => i % 4 !== 1);
export const mockCabinMonths = ["2027-02-01", "2027-03-01", "2027-04-01", "2027-05-01", "2027-06-01"];
export const eventStartTimes = Array.from({ length: 15 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`);

export const dateLabel = (value: string) => value
  ? new Date(`${value}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
  : "";
export const monthLabel = (value: string) => value
  ? new Date(`${value}T12:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
  : "";

export type Quote = { lines: { label: string; paise: number }[]; payNowPaise: number; depositPaise: number; totalPaise: number };

export function quoteFor(item: Bookable, choice: Choice): Quote {
  const option = item.options.find(o => o.id === choice.optionId) ?? item.options[0];
  const units = item.id === "event" ? choice.hours : 1;
  const rent = option.paise * units;
  const unitLabel = item.id === "cabin" ? "first month's rent" : item.id === "event" ? `${units} hour${units > 1 ? "s" : ""}` : option.label;
  const lines = [{ label: `${item.name} · ${unitLabel}`, paise: rent }];
  const deposit = item.depositPaise ?? 0;
  if (deposit) lines.push({ label: "Refundable deposit (bank transfer)", paise: deposit });
  return { lines, payNowPaise: rent, depositPaise: deposit, totalPaise: rent + deposit };
}

export function choiceReady(item: Bookable, c: Choice) {
  if (item.id === "desk") return Boolean(c.chair && c.start);
  if (item.id === "event") return Boolean(c.start && c.startTime && c.hours >= 1 && c.attendees >= 1 && c.attendees <= 35 && c.purpose.trim().length >= 10);
  if (item.id === "cabin") return Boolean(item.cabin && c.start);
  return Boolean(c.start);
}

export function choiceSummary(item: Bookable, c: Choice) {
  const option = item.options.find(o => o.id === c.optionId) ?? item.options[0];
  if (item.id === "desk") return [option.label, c.chair && `Chair ${c.chair}`, dateLabel(c.start)].filter(Boolean).join(" · ");
  if (item.id === "cabin") return item.cabin ? [item.name, c.start && `from ${monthLabel(c.start)}`, c.start && "billed monthly"].filter(Boolean).join(" · ") : "";
  if (item.id === "kit") return [option.label, c.start && `from ${dateLabel(c.start)}`].filter(Boolean).join(" ");
  return [dateLabel(c.start), c.startTime && `${c.startTime}, ${c.hours} h`, `${c.attendees} people`].filter(Boolean).join(" · ");
}

export const eventEnd = (startTime: string, hours: number) => `${String(Number(startTime.slice(0, 2)) + hours).padStart(2, "0")}:00`;

const freshFlow = (item: Bookable): Flow => ({
  stepIndex: 0,
  choice: { optionId: item.options[0].id, start: "", chair: "", startTime: "18:00", hours: 2, attendees: 20, purpose: "" },
  accepted: false, approved: false, agreement: "preparing", refundAccount: false,
  depositReference: "", depositVerified: false, paid: false,
  reference: `ARM-${item.id.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
});

export function useMockBooking(item: Bookable) {
  const [flow, setFlow] = useState(() => freshFlow(item));
  const step = item.steps[flow.stepIndex];
  const update = (patch: Partial<Flow>) => setFlow(f => ({ ...f, ...patch }));
  return {
    flow, step,
    setChoice: (patch: Partial<Choice>) => setFlow(f => ({ ...f, choice: { ...f.choice, ...patch } })),
    update,
    next: () => setFlow(f => ({ ...f, stepIndex: Math.min(f.stepIndex + 1, item.steps.length - 1) })),
    goTo: (index: number) => setFlow(f => (index <= f.stepIndex ? { ...f, stepIndex: index } : f)),
    reset: () => setFlow(freshFlow(item))
  };
}

export type MockBooking = ReturnType<typeof useMockBooking>;

export type StaffRequest = {
  id: string; itemId: Bookable["id"]; member: string; summary: string; amountPaise: number; submitted: string;
};

export const staffRequests: StaffRequest[] = [
  { id: "ARM-EVENT-4821", itemId: "event", member: "Sample member A", summary: "Robotics meetup · 18:00–21:00 · 30 people", amountPaise: 750000, submitted: "Today, 10:12" },
  { id: "ARM-CABIN-1180", itemId: "cabin", member: "Sample team B", summary: "From February 2027 · billed monthly", amountPaise: 4000000, submitted: "Yesterday" },
  { id: "ARM-KIT-2290", itemId: "kit", member: "Sample member C", summary: "30 days from next Monday", amountPaise: 390000, submitted: "Yesterday" },
  { id: "ARM-DESK-7314", itemId: "desk", member: "Sample member D", summary: "Week pass · Chair S07", amountPaise: 175000, submitted: "2 days ago" }
];

export const staffChecklists: Record<Bookable["id"], string[]> = {
  desk: ["Prepare the agreement in PandaDoc", "Upload the signed PDF and verify both signatures", "Payment received — chair reserved"],
  cabin: ["Confirm final details: capacity, access hours, permitted users, stamping", "Upload the signed agreement (MFA, different admin)", "Verify the refund account", "Verify the deposit transfer", "First month's rent received", "Record the handover", "Return and refund the deposit"],
  kit: ["Confirm final details and unused-deposit terms", "Upload the signed agreement (MFA, different admin)", "Verify the refund account", "Verify the deposit transfer", "Rent received", "Hand over the kit", "Inspect the return and refund the deposit"],
  event: ["Approve the slot and event details", "Prepare the agreement in PandaDoc", "Upload the signed PDF and verify both signatures", "Payment received — slot confirmed", "Event held"]
};
