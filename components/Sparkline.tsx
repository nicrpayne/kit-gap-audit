// Tiny inline trend chart -- plain SVG, no charting library, per the
// design brief ("a plain SVG polyline is enough for something this
// small"). Plots each snapshot's likelyDate on a normalized 0-100 scale
// so the shape reads correctly regardless of absolute date magnitude,
// with a dashed reference line at the target date (if the most recent
// snapshot has one) and the current point highlighted.

export interface SparklinePoint {
  generatedAt: string | Date;
  likelyDate: string | Date;
  targetDate: string | Date | null;
}

const WIDTH = 72;
const HEIGHT = 22;
const PAD = 3;

export default function Sparkline({ points, color = "var(--color-accent)" }: { points: SparklinePoint[]; color?: string }) {
  if (points.length < 2) {
    return <div style={{ width: WIDTH, height: HEIGHT }} />;
  }

  const values = points.map((p) => new Date(p.likelyDate).getTime());
  const targetDate = points[points.length - 1].targetDate;
  const targetValue = targetDate ? new Date(targetDate).getTime() : null;
  const all = targetValue !== null ? [...values, targetValue] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(1, max - min);

  // Earlier date = sooner = "better", so it's drawn HIGHER on the line
  // (smaller y), matching the intuitive "up is good" reading.
  const y = (v: number) => PAD + (1 - (v - min) / span) * (HEIGHT - 2 * PAD);
  const x = (i: number) => PAD + (i / (points.length - 1)) * (WIDTH - 2 * PAD);

  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden>
      {targetValue !== null && (
        <line
          x1={0}
          x2={WIDTH}
          y1={y(targetValue)}
          y2={y(targetValue)}
          stroke="var(--color-ink-soft)"
          strokeWidth={1}
          strokeDasharray="2,2"
          opacity={0.5}
        />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
