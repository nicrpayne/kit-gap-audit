export default function ConfidenceRing({ percent, size = 72 }: { percent: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const strokeWidth = size * 0.11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const color =
    clamped >= 70 ? "var(--color-accent)" : clamped >= 35 ? "var(--color-amber)" : "var(--color-danger)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-lg">
        {clamped}
      </div>
    </div>
  );
}
