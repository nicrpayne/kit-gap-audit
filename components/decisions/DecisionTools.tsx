"use client";

// THE THREE DOORS: create one, import several, connect one to delivery.
//
// The first two are deliberately trivial — if writing a decision down is
// slower than not writing it down, it does not get written down. Neither
// can produce a gate.
//
// The third is deliberately not trivial. It is the only path to the
// forecast, and it asks the four questions that make the claim auditable.
// Its friction is the product working, not an oversight.

import { useEffect, useRef, useState } from "react";
import ToolWindow from "@/components/instrument/ToolWindow";

// SUBMIT EXACTLY ONCE.
//
// The `busy` prop is React state, so it is not true until a render has
// happened -- a second activation dispatched before that render is not
// blocked by the disabled attribute, and creates a second decision. A ref
// flips synchronously inside the handler, which is the only thing that
// closes the window between the two.
//
// This is not theoretical: a run of scripts/decisions-proof.mjs produced
// two identical "How should addresses be stored?" rows from one intended
// submit, because the click was re-dispatched while the first POST was in
// flight. A human double-clicking a slow button does the same thing.
function useSubmitOnce(): [boolean, (fn: () => Promise<void>) => Promise<void>] {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const submit = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return [pending, submit];
}

interface ScopeOpt {
  id: string;
  name: string;
}

// A <select> whose state was initialised before the projects loaded shows
// the first option while holding "" -- the form looks answered and submits
// nothing. Every tool here therefore adopts its default at the moment it
// OPENS, not at mount, so what the control displays is what it holds.
function useDefaultOnOpen(open: boolean, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    if (open) setValue(fallback);
  }, [open, fallback]);
  return [value, setValue];
}

const inputStyle: React.CSSProperties = {
  background: "var(--i-recess)",
  border: "1px solid var(--i-border-strong)",
  color: "var(--i-text)",
};

function Question({ n, text, hint }: { n: number; text: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="i-label" style={{ color: "var(--i-text-faint)" }}>
        {String(n).padStart(2, "0")}
      </span>
      <div>
        <div className="text-[12px] font-medium text-[var(--i-text)]">{text}</div>
        {hint && <div className="mt-0.5 text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">{hint}</div>}
      </div>
    </div>
  );
}

// ── NEW DECISION ───────────────────────────────────────────────────────
export function NewDecisionTool({
  open,
  scopes,
  defaultScopeId,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  scopes: ScopeOpt[];
  defaultScopeId: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { scopeId: string; title: string; rationale: string; owner: string; neededBy: string }) => Promise<
    { duplicateTitle: string | null } | null
  >;
}) {
  const [title, setTitle] = useState("");
  const [scopeId, setScopeId] = useDefaultOnOpen(open, defaultScopeId);
  const [rationale, setRationale] = useState("");
  const [owner, setOwner] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [pending, submitOnce] = useSubmitOnce();

  const reset = () => {
    setTitle("");
    setRationale("");
    setOwner("");
    setNeededBy("");
    setDuplicate(null);
  };

  return (
    <ToolWindow
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New decision"
      subtitle="A choice exists. Writing it down changes no date."
      width={440}
      dataShoot="new-decision-tool"
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="i-label" htmlFor="nd-title">
            What needs to be decided?
          </label>
          <input
            id="nd-title"
            data-shoot="new-decision-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="How should addresses be stored?"
            autoFocus
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[13px]"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="i-label" htmlFor="nd-scope">
            Project
          </label>
          <select
            id="nd-scope"
            data-shoot="new-decision-scope"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[13px]"
            style={inputStyle}
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="i-label" htmlFor="nd-context">
            Optional context
          </label>
          <textarea
            id="nd-context"
            data-shoot="new-decision-context"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            placeholder="Discussed during refinement…"
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[12px]"
            style={inputStyle}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="i-label" htmlFor="nd-owner">
              Owner (optional)
            </label>
            <input
              id="nd-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[12px]"
              style={inputStyle}
            />
          </div>
          <div className="flex-1">
            <label className="i-label" htmlFor="nd-needed">
              Needed by (optional)
            </label>
            <input
              id="nd-needed"
              type="date"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[12px]"
              style={inputStyle}
            />
          </div>
        </div>

        {duplicate && (
          <div
            data-shoot="duplicate-warning"
            className="rounded-md px-3 py-2 text-[11px]"
            style={{ background: "var(--i-amber-soft)", color: "var(--i-amber)" }}
          >
            Possible existing decision: “{duplicate}”. Both now exist — merge them by attaching evidence to
            one and dismissing the other.
          </div>
        )}

        <p className="text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">
          Created OPEN and ungated. It will appear in the open lane with no connection to the delivery path,
          and no forecast will move.
        </p>
      </div>

      <div className="px-5 py-3" style={{ borderTop: "1px solid var(--i-border)" }}>
        <button
          data-shoot="new-decision-submit"
          disabled={!title.trim() || busy || pending}
          onClick={() =>
            submitOnce(async () => {
              const res = await onCreate({ scopeId, title, rationale, owner, neededBy });
              if (res?.duplicateTitle) {
                setDuplicate(res.duplicateTitle);
                setTitle("");
                return;
              }
              reset();
              onClose();
            })
          }
          className="w-full rounded-md px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] disabled:opacity-30"
          style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)", border: "1px solid var(--i-violet)" }}
        >
          Add decision
        </button>
      </div>
    </ToolWindow>
  );
}

// ── IMPORT ─────────────────────────────────────────────────────────────
export function ImportTool({
  open,
  scopes,
  defaultScopeId,
  busy,
  onClose,
  onImport,
}: {
  open: boolean;
  scopes: ScopeOpt[];
  defaultScopeId: string;
  busy: boolean;
  onClose: () => void;
  onImport: (input: { scopeId: string; text: string; mode: "candidates" | "decisions" }) => Promise<string | null>;
}) {
  const [scopeId, setScopeId] = useDefaultOnOpen(open, defaultScopeId);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"candidates" | "decisions">("candidates");
  const [result, setResult] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, submitOnce] = useSubmitOnce();

  return (
    <ToolWindow
      open={open}
      onClose={() => {
        setResult(null);
        onClose();
      }}
      title="Import"
      subtitle="Paste notes, or drop a spreadsheet. Neither can create a gate."
      width={470}
      dataShoot="import-tool"
    >
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="i-label" htmlFor="im-scope">
            Project
          </label>
          <select
            id="im-scope"
            data-shoot="import-scope"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[13px]"
            style={inputStyle}
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <label className="i-label" htmlFor="im-text">
              Paste text
            </label>
            <label
              className="ml-auto cursor-pointer text-[10.5px] text-[var(--i-text-faint)] hover:text-[var(--i-text-soft)]"
              style={{ textDecoration: "underline" }}
            >
              {reading ? "reading…" : "or choose a spreadsheet"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.md"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setReading(true);
                  try {
                    if (/\.(xlsx|xls)$/i.test(file.name)) {
                      // .xlsx is flattened by the parser this app already
                      // has, rather than by a second one written here.
                      const form = new FormData();
                      form.append("file", file);
                      const res = await fetch("/api/parse-spreadsheet", { method: "POST", body: form });
                      const body = (await res.json()) as { text?: string; sheets?: { text: string }[]; error?: string };
                      setText(body.text ?? (body.sheets ?? []).map((s) => s.text).join("\n") ?? "");
                    } else {
                      setText(await file.text());
                    }
                  } finally {
                    setReading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
          <textarea
            id="im-text"
            data-shoot="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={"One decision per line.\nAddress storage format | structured fields vs single string?"}
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[12px] font-mono"
            style={inputStyle}
          />
        </div>

        <div className="space-y-2">
          <ModeChoice
            selected={mode === "candidates"}
            onSelect={() => setMode("candidates")}
            shoot="import-mode-candidates"
            title="Review these first"
            body="Rows land in the candidate tray. Nothing becomes reality until you accept it."
          />
          <ModeChoice
            selected={mode === "decisions"}
            onSelect={() => setMode("decisions")}
            shoot="import-mode-decisions"
            title="These are decisions"
            body="Rows become open decisions immediately. Still ungated — no forecast moves."
          />
        </div>

        {result && (
          <div
            data-shoot="import-result"
            className="rounded-md px-3 py-2 text-[11px]"
            style={{ background: "var(--i-recess)", color: "var(--i-text-soft)" }}
          >
            {result}
          </div>
        )}
      </div>

      <div className="px-5 py-3" style={{ borderTop: "1px solid var(--i-border)" }}>
        <button
          data-shoot="import-submit"
          disabled={!text.trim() || busy || pending}
          onClick={() => submitOnce(async () => setResult(await onImport({ scopeId, text, mode })))}
          className="w-full rounded-md px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] disabled:opacity-30"
          style={{ background: "var(--i-violet-soft)", color: "var(--i-violet)", border: "1px solid var(--i-violet)" }}
        >
          {mode === "candidates" ? "Import as candidates" : "Import as open decisions"}
        </button>
      </div>
    </ToolWindow>
  );
}

function ModeChoice({
  selected,
  onSelect,
  shoot,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  shoot: string;
  title: string;
  body: string;
}) {
  return (
    <button
      data-shoot={shoot}
      onClick={onSelect}
      className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left"
      style={{
        border: `1px solid ${selected ? "var(--i-violet)" : "var(--i-border)"}`,
        background: selected ? "var(--i-violet-soft)" : "transparent",
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          border: `1px solid ${selected ? "var(--i-violet)" : "var(--i-border-strong)"}`,
          background: selected ? "var(--i-violet)" : "transparent",
        }}
      />
      <span>
        <span className="block text-[12px] font-medium text-[var(--i-text)]">{title}</span>
        <span className="mt-0.5 block text-[10.5px] text-[var(--i-text-faint)] leading-relaxed">{body}</span>
      </span>
    </button>
  );
}

// ── CONNECT TO DELIVERY ────────────────────────────────────────────────
export function ConnectTool({
  open,
  decisionTitle,
  scopes,
  defaultScopeId,
  busy,
  onClose,
  onConnect,
}: {
  open: boolean;
  decisionTitle: string;
  scopes: ScopeOpt[];
  defaultScopeId: string;
  busy: boolean;
  onClose: () => void;
  onConnect: (input: {
    targetScopeId: string;
    dependency: string;
    evidenceForGate: string;
    low: number;
    likely: number;
    high: number;
  }) => Promise<Record<string, string> | null>;
}) {
  const [targetScopeId, setTargetScopeId] = useDefaultOnOpen(open, defaultScopeId);
  const [dependency, setDependency] = useState("");
  const [evidenceForGate, setEvidenceForGate] = useState("");
  const [low, setLow] = useState("1");
  const [likely, setLikely] = useState("4");
  const [high, setHigh] = useState("10");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, submitOnce] = useSubmitOnce();

  // Opening the tool on a different decision must not inherit the last
  // one's answers -- a gate's claim belongs to exactly one decision.
  useEffect(() => {
    if (!open) return;
    setDependency("");
    setEvidenceForGate("");
    setErrors({});
  }, [open, decisionTitle]);

  return (
    <ToolWindow
      open={open}
      onClose={onClose}
      title="Connect to delivery"
      subtitle={decisionTitle}
      width={470}
      dataShoot="connect-tool"
    >
      <div className="px-5 py-4 space-y-4">
        <p className="text-[11px] text-[var(--i-text-soft)] leading-relaxed">
          This is the only way a decision reaches the forecast. Answer all four, and the claim becomes
          auditable by anyone who later asks why a date moved.
        </p>

        <div>
          <Question n={1} text="What waits on this?" hint="V1 gates a whole project. Features have no durable identity yet, so a smaller true model beats fake precision." />
          <select
            data-shoot="gate-target"
            value={targetScopeId}
            onChange={(e) => setTargetScopeId(e.target.value)}
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[13px]"
            style={inputStyle}
          >
            {scopes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Question n={2} text="Why can't it proceed?" hint="The engine adds gate time in series. If the work could genuinely continue in parallel, this is not a gate." />
          <textarea
            data-shoot="gate-dependency"
            value={dependency}
            onChange={(e) => setDependency(e.target.value)}
            rows={2}
            placeholder="Users cannot sign in before this is decided."
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[12px]"
            style={{ ...inputStyle, borderColor: errors.dependency ? "var(--i-red)" : "var(--i-border-strong)" }}
          />
          {errors.dependency && <FieldError>{errors.dependency}</FieldError>}
        </div>

        <div>
          <Question n={3} text="What evidence supports that?" />
          <textarea
            data-shoot="gate-evidence"
            value={evidenceForGate}
            onChange={(e) => setEvidenceForGate(e.target.value)}
            rows={2}
            placeholder="Refinement call on Aug 14 where we confirmed all sign-in depends on this choice."
            className="mt-1.5 w-full rounded-md px-2.5 py-2 text-[12px]"
            style={{ ...inputStyle, borderColor: errors.evidenceForGate ? "var(--i-red)" : "var(--i-border-strong)" }}
          />
          {errors.evidenceForGate && <FieldError>{errors.evidenceForGate}</FieldError>}
        </div>

        <div>
          <Question n={4} text="How long could resolving it take?" hint="Sampled exactly like any other three-point estimate — this is uncertainty, not a deadline." />
          <div className="mt-1.5 flex gap-2">
            {(
              [
                ["Low", low, setLow, "gate-low"],
                ["Likely", likely, setLikely, "gate-likely"],
                ["High", high, setHigh, "gate-high"],
              ] as const
            ).map(([label, value, set, shoot]) => (
              <div key={label} className="flex-1">
                <div className="i-label">{label}</div>
                <div className="relative">
                  <input
                    data-shoot={shoot}
                    type="number"
                    min="0"
                    step="0.5"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="mt-1 w-full rounded-md px-2.5 py-2 text-[13px] i-readout"
                    style={{ ...inputStyle, borderColor: errors.estimate ? "var(--i-red)" : "var(--i-border-strong)" }}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--i-text-faint)]">
                    d
                  </span>
                </div>
              </div>
            ))}
          </div>
          {errors.estimate && <FieldError>{errors.estimate}</FieldError>}
        </div>

        {errors.targetScopeId && <FieldError>{errors.targetScopeId}</FieldError>}
      </div>

      <div className="px-5 py-3" style={{ borderTop: "1px solid var(--i-border)" }}>
        <button
          data-shoot="gate-submit"
          disabled={busy || pending}
          onClick={() =>
            submitOnce(async () => {
              const errs = await onConnect({
                targetScopeId,
                dependency,
                evidenceForGate,
                low: Number(low),
                likely: Number(likely),
                high: Number(high),
              });
              setErrors(errs ?? {});
              if (!errs) onClose();
            })
          }
          className="w-full rounded-md px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] disabled:opacity-30"
          style={{ background: "var(--i-red-soft)", color: "var(--i-red)", border: "1px solid var(--i-red)" }}
        >
          Insert into delivery path
        </button>
      </div>
    </ToolWindow>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 text-[10.5px]" style={{ color: "var(--i-red)" }}>
      {children}
    </div>
  );
}
