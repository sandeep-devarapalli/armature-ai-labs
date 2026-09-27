export function labDateTimeInput(date: Date) {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

export function labInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error("Choose a valid lab date and time.");
  const date = new Date(`${value}+05:30`);
  if (!Number.isFinite(date.getTime()) || labDateTimeInput(date) !== value.slice(0, 16)) throw new Error("Choose a valid lab date and time.");
  return date;
}
