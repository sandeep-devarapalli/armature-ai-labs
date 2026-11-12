export type BookableKind = "desk" | "rental" | "event";
export type BookableId = "desk" | "cabin" | "kit" | "event";

export type PriceOption = { id: string; label: string; paise: number; per: string };

export type Bookable = {
  id: BookableId;
  kind: BookableKind;
  name: string;
  summary: string;
  includes: string[];
  options: PriceOption[];
  depositPaise?: number;
  depositNote?: string;
  depositLabel?: string;
  browse?: string;
  cabin?: string;
  minimum: string;
  eligibility: string;
  approval: string;
  cancellation: string[];
  steps: { id: StepId; title: string; detail: string }[];
};

export type StepId = "choose" | "review" | "approval" | "agreement" | "deposit" | "pay" | "done";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const formatPaise = (paise: number) => rupees.format(paise / 100);

export const taxNote = "Armature is not GST-registered, so no GST is added. Any future tax is shown before you accept a quote.";

const agreementStep = { id: "agreement" as const, title: "Sign the agreement", detail: "Armature prepares a short agreement. You sign in PandaDoc, then Armature countersigns." };
const payStep = { id: "pay" as const, title: "Pay", detail: "Pay securely through Razorpay within 30 minutes of the payment link opening." };

export const catalogue: Bookable[] = [
  {
    id: "desk",
    kind: "desk",
    name: "Desk pass",
    summary: "A chair on the lab floor, by the day, week or month.",
    includes: ["Standard access 09:00–17:00 IST", "Flexi and reserved chairs share one pool of 25", "Pick your own chair when you book"],
    options: [
      { id: "day", label: "Day pass", paise: 35000, per: "day" },
      { id: "week", label: "Week pass", paise: 175000, per: "7 days" },
      { id: "month", label: "Monthly desk", paise: 1300000, per: "calendar month" }
    ],
    minimum: "1 day",
    eligibility: "Verified membership",
    approval: "No approval needed when a chair is free",
    cancellation: ["48 hours or more before the start: full refund", "Under 48 hours, no-show or after the start: no refund"],
    steps: [
      { id: "choose", title: "Choose your pass", detail: "Pick a pass, a chair and a start date. Only free dates can be picked." },
      { id: "review", title: "Review price and terms", detail: "Check the total and the cancellation rule before you request the agreement." },
      agreementStep,
      payStep,
      { id: "done", title: "Confirmed", detail: "Payment received. Your chair is reserved." }
    ]
  },
  {
    id: "cabin",
    kind: "rental",
    name: "Team cabins",
    summary: "A whole cabin for your team, for 4 to 10 people, by the calendar month.",
    includes: ["Glass partitions and a glass door, furnished like Cabin 101", "Rent is per billable seat; extra seats are free", "Starts on the 1st of a month; rent is paid month by month, with no auto-debit"],
    // Owner 2026-11-09: list price INR 20,000 per billable seat a month; 101 is occupied, 201-203 have no deposit or start date yet.
    options: [{ id: "month", label: "Per billable seat", paise: 2000000, per: "seat a month" }],
    depositLabel: "To be confirmed",
    depositNote: "Refundable security deposit, paid by bank transfer. Armature confirms the amount before the agreement.",
    minimum: "1 calendar month",
    eligibility: "Verified membership",
    approval: "Armature reviews the request before the agreement",
    cancellation: ["30 days or more before the start: full refund", "Under 30 days: deposit refunded, first month's rent kept", "After move-in: 30 days' notice to month-end; paid rent is not refunded"],
    steps: [
      { id: "choose", title: "Choose a cabin and start month", detail: "Find the cabin on the floor plan, then pick the first month. Rent is then requested month by month until you give notice." },
      { id: "review", title: "Review rent, deposit and terms", detail: "Rent and the refundable deposit are shown separately." },
      agreementStep,
      { id: "deposit", title: "Pay the deposit by bank transfer", detail: "Add the account for the deposit refund, then send the deposit and enter the transfer reference." },
      { ...payStep, title: "Pay the first month's rent" },
      { id: "done", title: "Confirmed", detail: "Deposit and rent received. The cabin is yours from the start date." }
    ]
  },
  {
    id: "kit",
    kind: "rental",
    name: "Equipment",
    summary: "Robot arms and cameras by the day, week or month. Most items can also be bought.",
    includes: ["Hiwonder and ThinkRobotics SO-101 arms, Waveshare 5 MP cameras", "Each item has its own page: version, specs, parts and stock", "Stays in the lab; needs workspace access for the same period"],
    options: [
      { id: "day", label: "1 day", paise: 20000, per: "day" },
      { id: "week", label: "7 days", paise: 80000, per: "week" },
      { id: "month", label: "30 days", paise: 200000, per: "month" }
    ],
    depositPaise: 2500000,
    depositLabel: "Arms ₹25,000; cameras none",
    depositNote: "Refundable security deposit for arms, paid by bank transfer and returned within 7 working days of the return. Cameras need no deposit.",
    browse: "equipment",
    minimum: "1 day (cameras), 7 days (arms)",
    eligibility: "Verified membership and workspace access",
    approval: "Armature reviews the request before the agreement",
    cancellation: ["48 hours or more before the start: full refund or one free reschedule", "Under 48 hours: no refund"],
    steps: [
      { id: "choose", title: "Choose your period", detail: "Pick 7 or 30 days and a start date." },
      { id: "review", title: "Review rent, deposit and terms", detail: "Rent and the refundable deposit are shown separately." },
      agreementStep,
      { id: "deposit", title: "Pay the deposit by bank transfer", detail: "Add the account for the deposit refund, then send the deposit and enter the transfer reference." },
      { ...payStep, title: "Pay the rent" },
      { id: "done", title: "Confirmed", detail: "Deposit and rent received. Collect the kit in the lab on your start date." }
    ]
  },
  {
    id: "event",
    kind: "event",
    name: "Event space",
    summary: "The demo floor for meetups, launches and live demos.",
    includes: ["Up to 35 people", "Any time between 08:00 and 23:00, same day", "Minimum 1 hour, booked by the hour"],
    options: [{ id: "hour", label: "Per hour", paise: 250000, per: "hour" }],
    minimum: "1 hour",
    eligibility: "Verified membership",
    approval: "Armature approves every event before payment",
    cancellation: ["48 hours or more before the event: 50% refund", "Under 48 hours, no-show or after the start: no refund"],
    steps: [
      { id: "choose", title: "Choose your slot", detail: "Pick a date, start time, hours and expected attendees, and tell us about the event." },
      { id: "review", title: "Review price and terms", detail: "Check the total and the cancellation rule, then send the request." },
      { id: "approval", title: "Armature reviews", detail: "We check the slot and your event details before anything is charged." },
      agreementStep,
      payStep,
      { id: "done", title: "Confirmed", detail: "Payment received. Your event slot is confirmed." }
    ]
  }
];

export const findBookable = (id: string | undefined) => catalogue.find(item => item.id === id);
