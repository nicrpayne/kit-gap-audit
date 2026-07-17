export default function ComingNext({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-10 max-w-2xl">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-accent)] mb-2">
        Coming next
      </div>
      <h1 className="font-display text-3xl mb-4">{title}</h1>
      <p className="text-[var(--color-ink-soft)] leading-relaxed">{description}</p>
    </div>
  );
}
