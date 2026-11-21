import { useEffect, useState } from "react";

const seatCodes = Array.from({ length: 13 }, (_, i) => "S" + String(i + 1).padStart(2, "0"));
const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const eventTime = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateAt = (date: string) => new Date(date + "T00:00:00Z");
const seatNumber = (code: string) => Number(code.slice(1));
const addDays = (date: string, days: number) => {
  const value = dateAt(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

type CalendarEvent = { date: string; title: string; startsAt: string; endsAt: string; blocksDesk: boolean };
type DeskTerm = "day" | "week" | "month";
type Props = {
  today: string;
  busy: boolean;
  request: <T>(input: object) => Promise<T>;
  onQuote: (chair: string, unit: DeskTerm, start: string) => void;
};

export function DeskAvailabilityCalendar({ today, busy, request, onQuote }: Props) {
  const end = addDays(today, 30);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState("");
  const [chair, setChair] = useState("");
  const [unit, setUnit] = useState<DeskTerm>("day");
  const [events, setEvents] = useState<CalendarEvent[]>();
  const [availability, setAvailability] = useState<{ key: string; chairs: string[] }>();
  const [eventError, setEventError] = useState("");
  const [seatError, setSeatError] = useState("");
  const [retry, setRetry] = useState(0);
  const selection = unit + ":" + date;
  const chairs = availability?.key === selection ? availability.chairs : undefined;
  const selectedEvents = events?.filter(event => event.date === date) ?? [];

  useEffect(() => {
    let active = true;
    setEventError("");
    void request<{ events: CalendarEvent[] }>({ action: "desk_calendar", from: today, to: end })
      .then(result => { if (active) setEvents(result.events); })
      .catch(() => { if (active) setEventError("The event calendar could not load."); });
    return () => { active = false; };
  }, [today, end, request, retry]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setSeatError("");
    void request<{ chairs: string[] }>({ action: "desk_calendar_chairs", start: date, unit })
      .then(result => { if (active) setAvailability({ key: selection, chairs: result.chairs }); })
      .catch(() => { if (active) setSeatError("Desk availability could not load."); });
    return () => { active = false; };
  }, [date, unit, request, retry, selection]);

  const visibleDays = Array.from({ length: 31 }, (_, i) => addDays(today, i)).filter(day => day.startsWith(month));
  const firstDay = visibleDays[0];
  const padding = (dateAt(firstDay ?? today).getUTCDay() + 6) % 7;
  const previousMonth = addDays(month + "-01", -1).slice(0, 7);
  const nextMonth = addDays(month + "-28", 4).slice(0, 7);
  const ready = !!events && !!chairs?.includes(chair) && !eventError && !seatError;

  return <form className="desk-calendar-layout" onSubmit={event => {
    event.preventDefault();
    if (ready) onQuote(chair, unit, date);
  }}>
    <div className="desk-calendar-panel">
      <h3>Find an available day</h3>
      <p>Ground floor · Weekdays, 9 am–5 pm IST · Book up to 30 days ahead</p>
      <fieldset>
        <legend>Desk pass</legend>
        <div className="desk-calendar-controls">
          {([["day", "Day Pass"], ["week", "Week Pass"], ["month", "Month Pass"]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={unit === value} disabled={busy} onClick={() => { setUnit(value); setChair(""); }}>{label}</button>)}
        </div>
      </fieldset>
      <div className="desk-calendar-month">
        <button type="button" disabled={busy || previousMonth < today.slice(0, 7)} onClick={() => setMonth(previousMonth)}>Previous <span className="sr-only">month</span></button>
        <strong>{monthLabel.format(dateAt(month + "-01"))}</strong>
        <button type="button" disabled={busy || nextMonth > end.slice(0, 7)} onClick={() => setMonth(nextMonth)}>Next <span className="sr-only">month</span></button>
      </div>
      <div className="desk-calendar-grid" aria-label="Booking calendar">
        {weekdays.map(day => <span key={day}>{day}</span>)}
        {Array.from({ length: padding }, (_, i) => <span key={i} aria-hidden="true" />)}
        {visibleDays.map(day => {
          const dayEvents = events?.filter(event => event.date === day) ?? [];
          const weekend = [0, 6].includes(dateAt(day).getUTCDay());
          const state = dayEvents.length ? "Event" : weekend ? "Weekend" : "";
          return <button type="button" key={day} aria-label={dayLabel.format(dateAt(day)) + (state ? ", " + state : "")}
            aria-pressed={date === day} data-event={dayEvents.length > 0} disabled={busy || (weekend && !dayEvents.length)}
            onClick={() => { if (day !== date) { setAvailability(undefined); setDate(day); setChair(""); } }}>
            {Number(day.slice(-2))}<small>{state}</small>
          </button>;
        })}
      </div>
      {selectedEvents.map(event => <div className="desk-calendar-event" key={event.startsAt + event.endsAt}>
        <strong>{event.title}</strong>
        <p>Ground floor · {eventTime.format(new Date(event.startsAt))}–{eventTime.format(new Date(event.endsAt))} IST · Confirmed</p>
        <p>{event.blocksDesk ? "Ground-floor desks are closed for this day." : "This event falls outside desk reservation hours."}</p>
      </div>)}
      {!!date && <fieldset>
        <legend>Ground floor · S1–S13</legend>
        <div className="desk-calendar-controls">
          {seatCodes.map(code => <button key={code} type="button" aria-pressed={chair === code}
            disabled={busy || !chairs?.includes(code)} onClick={() => setChair(code)}>S{seatNumber(code)}</button>)}
        </div>
        {!chairs && !seatError && <p role="status">Checking seat availability…</p>}
        {chairs?.length === 0 && <p role="status">No ground-floor seats are available for this pass on the selected date.</p>}
      </fieldset>}
      {(eventError || seatError) && <div role="alert"><p>{eventError || seatError}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry availability</button></div>}
    </div>
    <aside className="desk-calendar-panel desk-calendar-summary">
      <h3>Your booking</h3>
      <dl>
        <div><dt>{unit === "day" ? "Reservation" : "Start date"}</dt><dd>{date ? dayLabel.format(dateAt(date)) : "Choose a date"}</dd></div>
        <div><dt>Total</dt><dd>{({ day: "₹350", week: "₹1,750", month: "₹13,000" })[unit]}</dd></div>
        <div><dt>Booked seat</dt><dd>{chair ? "S" + seatNumber(chair) + " · Ground floor" : "Choose a seat"}</dd></div>
        <div><dt>Reserved fallback</dt><dd>{chair ? "F" + seatNumber(chair) + " · First floor" : "Shown after selection"}</dd></div>
      </dl>
      <p>Your matching first-floor seat is reserved for relocation. If you need to move, we’ll tell you. Your booking and hours stay the same.</p>
      <button type="submit" className="button button-primary" disabled={busy || !ready}>Review and pay</button>
    </aside>
  </form>;
}
