export function BrandMark({
  compact = false,
  animated = false,
  mono = false
}: {
  compact?: boolean;
  animated?: boolean;
  mono?: boolean;
}) {
  const markClasses = [
    "brand-mark",
    animated && "brand-mark--animated",
    mono && "brand-mark--mono"
  ].filter(Boolean).join(" ");

  return (
    <span className="brand-lockup" aria-label="armature ai labs">
      <svg
        className={markClasses}
        viewBox="0 0 100 100"
        role="img"
        aria-label="armature ai labs mark"
      >
        <path
          className="brand-mark-segment brand-mark-segment--north-east brand-mark-segment--pair-3"
          d="M69.31 22.62 A33.5 33.5 0 0 1 77.38 30.69 L74.69 32.09 A30.5 30.5 0 0 0 67.91 25.31 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--east brand-mark-segment--live brand-mark-segment--pair-0"
          d="M83.01 44.30 A33.5 33.5 0 0 1 83.01 55.70 L80.12 54.80 A30.5 30.5 0 0 0 80.12 45.20 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--south-east brand-mark-segment--pair-1"
          d="M77.38 69.31 A33.5 33.5 0 0 1 69.31 77.38 L67.91 74.69 A30.5 30.5 0 0 0 74.69 67.91 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--south brand-mark-segment--pair-2"
          d="M55.70 83.01 A33.5 33.5 0 0 1 44.30 83.01 L45.20 80.12 A30.5 30.5 0 0 0 54.80 80.12 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--south-west brand-mark-segment--pair-3"
          d="M30.69 77.38 A33.5 33.5 0 0 1 22.62 69.31 L25.31 67.91 A30.5 30.5 0 0 0 32.09 74.69 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--west brand-mark-segment--live brand-mark-segment--pair-0"
          d="M16.99 55.70 A33.5 33.5 0 0 1 16.99 44.30 L19.88 45.20 A30.5 30.5 0 0 0 19.88 54.80 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--north-west brand-mark-segment--pair-1"
          d="M22.62 30.69 A33.5 33.5 0 0 1 30.69 22.62 L32.09 25.31 A30.5 30.5 0 0 0 25.31 32.09 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <path
          className="brand-mark-segment brand-mark-segment--north brand-mark-segment--pair-2"
          d="M44.30 16.99 A33.5 33.5 0 0 1 55.70 16.99 L54.80 19.88 A30.5 30.5 0 0 0 45.20 19.88 Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinejoin="round"
        />
        <circle className="brand-mark-shaft" cx="50" cy="50" r="9.5" fill="currentColor" />
      </svg>
      {!compact && <span>armature ai labs</span>}
    </span>
  );
}
