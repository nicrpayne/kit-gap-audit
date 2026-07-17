const COLORS: Record<string, string> = {
  high: "var(--color-danger)",
  medium: "var(--color-amber)",
  low: "var(--color-ink-soft)",
};

export default function SeverityDot({ severity }: { severity: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full shrink-0"
      style={{ backgroundColor: COLORS[severity] ?? COLORS.low }}
      title={severity}
    />
  );
}
