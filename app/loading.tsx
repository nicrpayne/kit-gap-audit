export default function Loading() {
  return (
    <div className="p-10 max-w-3xl animate-pulse">
      <div className="h-3 w-24 bg-[var(--color-line)] rounded mb-4" />
      <div className="h-8 w-64 bg-[var(--color-line)] rounded mb-8" />
      <div className="space-y-3">
        <div className="h-20 bg-[var(--color-card)] border border-[var(--color-line)] rounded-xl" />
        <div className="h-20 bg-[var(--color-card)] border border-[var(--color-line)] rounded-xl" />
        <div className="h-20 bg-[var(--color-card)] border border-[var(--color-line)] rounded-xl" />
      </div>
    </div>
  );
}
