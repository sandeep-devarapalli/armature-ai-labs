// Numbered booking steps; steps before `current` are done. `current` equal to the length marks every step done.
export function BookingSteps({ steps, current }: { steps: string[]; current: number }) {
  return <ol className="booking-steps" aria-label="Booking steps">
    {steps.map((step, i) => <li key={step} className={i < current ? "is-done" : i === current ? "is-current" : "is-next"} aria-current={i === current ? "step" : undefined}>
      <span className="booking-step-dot mono" aria-hidden="true">{i < current ? "✓" : i + 1}</span>
      {step}{i < current && <span className="sr-only"> (done)</span>}
    </li>)}
  </ol>;
}
