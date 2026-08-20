// The skeleton every route shows while its data resolves. It used to be
// cream blocks, which meant a flash of the retired Workbench palette on
// every navigation — the one place the old shell could still appear after
// the migration. Graphite now, same shapes.
export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse p-10" style={{ background: "var(--i-void)" }}>
      <div className="mx-auto w-full max-w-[900px]">
        <div className="mb-4 h-2.5 w-24 rounded" style={{ background: "var(--i-border)" }} />
        <div className="mb-8 h-8 w-64 rounded" style={{ background: "var(--i-border)" }} />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-[10px]"
              style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
