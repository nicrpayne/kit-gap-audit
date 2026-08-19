"use client";

// WHAT DOES THIS THING CAUSE?
//
// The Field shows the project's shape. This panel answers the question a
// shape provokes — "so what happens if that moves?" — and it answers it in
// the model's own terms:
//
//   a LANE     what it waits on, what waits on it, how much of its date is
//              still backlog, and how far it is from its own target
//   an EDGE    the upstream, the launches riding on it, and the real gap
//              between two real P50s
//   a GATE     what it is holding, its stored modelled delay, and every
//              lane that moves when it is answered
//   a CHANNEL  committed against arriving, and where the loss goes
//
// Nothing here is a new number. Every figure is already on the Field or in
// the reading, said once more with its consequence attached. When nothing
// is selected the panel says what the project is doing on its own — it is
// never blank, because an empty rail teaches nothing.

import Link from "next/link";
import type { ProjectField, Selection } from "@/lib/control-room/field";
import type { ControlRoomReading } from "@/lib/control-room/read";

const DAY = 86400000;
const dShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function Inspector({
  field,
  reading,
  selection,
  onSelect,
  scenarioActive,
}: {
  field: ProjectField;
  reading: ControlRoomReading;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  scenarioActive: boolean;
}) {
  const date = (days: number) => dShort(new Date(field.startDate.getTime() + days * DAY));
  const laneById = new Map(field.lanes.map((l) => [l.scopeId, l]));
  const nameOf = (id: string) => laneById.get(id)?.name ?? id;

  let body: React.ReactNode = null;
  let title = "The project";
  let kicker = "nothing selected";
  let accent = "var(--i-signal)";
  let door: { href: string; label: string } | null = null;

  if (!selection) {
    const gating = field.gatingScopeId ? laneById.get(field.gatingScopeId) : null;
    const shared = field.sharedUpstreamIds[0] ? laneById.get(field.sharedUpstreamIds[0]) : null;
    const openGates = field.gates.filter((g) => !g.released);
    body = (
      <>
        <Line
          label="Lands"
          value={gating?.p50 != null ? date(gating.p50) : "—"}
          note={gating ? `${gating.name} is last` : "nothing simulated"}
          tone="var(--i-signal)"
        />
        {/* A DECISION IS NOT A GATE, and the difference is the point. Both
            numbers are stated together because "35 open" without "2 actually
            holding delivery" is the exact misreading this product exists to
            prevent. */}
        <Line
          label="Held by"
          value={openGates.length ? `${openGates.length} ${plural(openGates.length, "gate", "gates")}` : "no gate"}
          note={
            openGates.length
              ? `${openGates.reduce((n, g) => n + g.likelyDays, 0)}d modelled, on ${new Set(openGates.map((g) => g.scopeId)).size} ${plural(new Set(openGates.map((g) => g.scopeId)).size, "lane", "lanes")} · ${Math.max(0, reading.choices.open - reading.choices.gating)} open decisions are not holding any date`
              : `nothing is clamped · ${reading.choices.open} open decisions are not holding any date`
          }
          tone={openGates.length ? "var(--i-amber)" : "var(--i-mint)"}
        />
        <Line
          label="Single point"
          value={shared ? shared.name : "none"}
          note={
            shared
              ? `${shared.downstreamScopeIds.length} ${plural(shared.downstreamScopeIds.length, "launch rides", "launches ride")} on it`
              : "no project carries more than one other"
          }
          tone={shared ? "var(--i-amber)" : "var(--i-mint)"}
        />
        <Line
          label="Arriving"
          value={reading.capacity.arrivingPct === null ? "—" : `${Math.round(reading.capacity.arrivingPct)}%`}
          note={`${reading.capacity.effective.toFixed(1)} of ${reading.capacity.raw.toFixed(1)} FTE reaches the work`}
          tone="var(--i-mint)"
        />
        <p className="pt-3 text-[10.5px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
          Select a lane, a clamp or a dependency spine on the field to see what its movement reaches.
        </p>
      </>
    );
  }

  if (selection?.kind === "lane" || selection?.kind === "capacity") {
    const l = laneById.get(selection.id);
    if (l) {
      const isCap = selection.kind === "capacity";
      title = l.name;
      kicker = isCap ? "capacity channel" : "project lane";
      accent = isCap ? "var(--i-mint)" : scenarioActive ? "var(--i-violet)" : "var(--i-signal)";
      door = { href: isCap ? "/portfolio" : "/scope", label: isCap ? "Portfolio" : "Scope" };
      body = isCap ? (
        <>
          <Line
            label="Committed"
            value={`${l.capacityRaw.toFixed(1)} FTE`}
            note={
              l.capacityBasis === "allocations"
                ? "named people, from the roster"
                : "a counted stand-in — nobody is allocated here"
            }
            tone="var(--i-mint)"
          />
          <Line
            label="Arriving"
            value={`${l.capacityEffective.toFixed(1)} FTE`}
            note={
              l.capacityRaw - l.capacityEffective > 0.01
                ? `${(l.capacityRaw - l.capacityEffective).toFixed(1)} lost crossing between projects`
                : "nothing is lost to switching here"
            }
            tone="var(--i-mint)"
          />
          <Line
            label="Split"
            value={`${l.splitPeople} ${plural(l.splitPeople, "person", "people")}`}
            note={l.splitPeople ? "also working on another project" : "everybody here is here only"}
            tone={l.splitPeople ? "var(--i-amber)" : "var(--i-mint)"}
          />
          {l.capacityRequired > 0.01 && (
            <Line
              label="Absent"
              value={`${l.capacityRequired.toFixed(1)} FTE`}
              note="asked for and not on the roster — never manufactured"
              tone="var(--i-red)"
            />
          )}
          <Consequence
            text={
              l.capacityBasis === "allocations"
                ? "Capacity is a current-state model. There is no allocation history, so this cannot be shown as a trend."
                : "This lane's capacity is inferred from who is assigned in Linear, not from the roster."
            }
          />
        </>
      ) : (
        <>
          <Line
            label="Lands"
            value={l.p50 != null ? date(l.p50) : "—"}
            note={
              l.p10 != null && l.p90 != null ? `P10 ${date(l.p10)} → P90 ${date(l.p90)}` : "no simulation"
            }
            tone={accent}
          />
          {l.targetDays !== null && (
            <Line
              label="Target"
              value={date(l.targetDays)}
              note={
                l.gapDays === null
                  ? ""
                  : l.gapDays > 0
                    ? `${Math.round(l.gapDays)}d late${l.confidence !== null ? ` · ${l.confidence}% confidence` : ""}`
                    : `${Math.abs(Math.round(l.gapDays))}d of room${l.confidence !== null ? ` · ${l.confidence}% confidence` : ""}`
              }
              tone="var(--i-amber)"
            />
          )}
          <Line
            label="Waits on"
            value={l.dependsOnScopeIds.length ? l.dependsOnScopeIds.map(nameOf).join(", ") : "nothing"}
            note={l.dependsOnScopeIds.length ? "declared, and honoured by the engine" : "it can start whenever it likes"}
            tone={l.dependsOnScopeIds.length ? "var(--i-amber)" : "var(--i-mint)"}
          />
          <Line
            label="Carries"
            value={
              l.downstreamScopeIds.length
                ? `${l.downstreamScopeIds.length} ${plural(l.downstreamScopeIds.length, "launch", "launches")}`
                : "nothing"
            }
            note={l.downstreamScopeIds.length ? l.downstreamScopeIds.map(nameOf).join(", ") : "nothing waits on it"}
            tone={l.downstreamScopeIds.length ? "var(--i-amber)" : "var(--i-text-soft)"}
          />
          <Line
            label="Backlog buys"
            value={l.headroomDays === null ? "—" : `${Math.round(l.headroomDays)}d`}
            note={
              l.headroomDays === null
                ? "no floor computed"
                : l.dominated
                  ? "cutting every item would not move this date"
                  : "the most that cutting all remaining work could pull it in"
            }
            tone={l.dominated ? "var(--i-amber)" : "var(--i-text-soft)"}
          />
          {l.dominated && l.dominancePhrase && (
            <Consequence text={`This date is no longer set by the backlog — ${l.dominancePhrase}.`} />
          )}
          {l.downstreamScopeIds.length > 0 && (
            <Consequence
              text={`If ${l.name} slips a day, ${l.downstreamScopeIds.map(nameOf).join(" and ")} ${l.downstreamScopeIds.length === 1 ? "can" : "can each"} slip with it.`}
            />
          )}
        </>
      );
    }
  }

  if (selection?.kind === "edge") {
    const e = field.edges.find((x) => x.id === selection.id);
    const up = e ? laneById.get(e.fromScopeId) : null;
    if (e && up) {
      const kids = field.lanes.filter((l) => l.dependsOnScopeIds.includes(up.scopeId));
      title = up.name;
      kicker = "upstream dependency";
      accent = kids.length > 1 ? "var(--i-amber)" : "var(--i-text-soft)";
      door = { href: `/orbit?focus=${kids[0]?.scopeId ?? up.scopeId}&select=${encodeURIComponent(`dependency:${up.scopeId}`)}`, label: "Orbit" };
      body = (
        <>
          <Line
            label="Releases at"
            value={up.p50 != null ? date(up.p50) : "—"}
            note={`${up.name} lands here`}
            tone="var(--i-signal)"
          />
          {kids.map((k) => (
            <Line
              key={k.scopeId}
              label="Then"
              value={k.p50 != null ? date(k.p50) : "—"}
              note={
                k.p50 != null && up.p50 != null
                  ? `${k.name} — ${Math.round(k.p50 - up.p50)}d after ${up.name}`
                  : k.name
              }
              tone="var(--i-text-soft)"
            />
          ))}
          <Consequence
            text={
              kids.length > 1
                ? `${up.name} is a single point: one slip here moves ${kids.length} launches, not one.`
                : `${kids[0]?.name ?? "The downstream project"} cannot finish before ${up.name} does. The engine takes the later of the two in every trial.`
            }
          />
        </>
      );
    }
  }

  if (selection?.kind === "gate") {
    const g = field.gates.find((x) => x.id === selection.id);
    if (g) {
      const blocked = laneById.get(g.scopeId);
      title = g.label;
      kicker = g.released ? "assumed answered" : "unanswered decision";
      accent = "var(--i-amber)";
      door = { href: "/decisions", label: "Decisions" };
      body = (
        <>
          <Line
            label="Holding"
            value={blocked?.name ?? g.scopeId}
            note="a gate blocks a project, not a capability — the model has no feature-level gate"
            tone="var(--i-amber)"
          />
          <Line
            label="Modelled"
            value={`${g.likelyDays}d`}
            note="the stored likely delay, sampled serially before the work starts"
            tone="var(--i-amber)"
          />
          <Line
            label="Downstream"
            value={
              g.downstreamScopeIds.length
                ? `${g.downstreamScopeIds.length} ${plural(g.downstreamScopeIds.length, "launch", "launches")}`
                : "none"
            }
            note={g.downstreamScopeIds.length ? g.downstreamScopeIds.map(nameOf).join(", ") : "nothing waits behind it"}
            tone={g.downstreamScopeIds.length ? "var(--i-amber)" : "var(--i-text-soft)"}
          />
          <Consequence
            text={
              g.released
                ? "Assumed answered in this Scenario. Reality still has it open."
                : `Answering this releases ${blocked?.name ?? "the lane"}${g.downstreamScopeIds.length ? ` and everything behind it` : ""}.`
            }
          />
        </>
      );
    }
  }

  return (
    <section
      data-shoot="cr-inspector"
      data-selection={selection ? `${selection.kind}:${selection.id}` : "none"}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg"
      style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)" }}
    >
      <span aria-hidden className="absolute left-0 top-0 h-full w-[2px]" style={{ background: accent, opacity: 0.6 }} />
      <header className="flex shrink-0 items-start justify-between gap-3 px-3.5 pt-3 pb-2.5">
        <div className="min-w-0">
          <p className="i-label" style={{ color: "var(--i-text-faint)" }}>
            {kicker}
          </p>
          <h2 className="truncate pt-0.5 text-[13px] leading-tight" style={{ color: "var(--i-text)" }}>
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {door && (
            <Link href={door.href} className="text-[10.5px] hover:underline" style={{ color: "var(--i-signal)" }}>
              {door.label} →
            </Link>
          )}
          {selection && (
            <button
              data-shoot="cr-inspector-clear"
              onClick={() => onSelect(null)}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ border: "1px solid var(--i-border-strong)", color: "var(--i-text-faint)" }}
            >
              Clear
            </button>
          )}
        </div>
      </header>
      <div className="i-noscrollbar min-h-0 flex-1 overflow-y-auto px-3.5 pb-3.5">{body}</div>
    </section>
  );
}

function Line({ label, value, note, tone }: { label: string; value: string; note?: string; tone: string }) {
  return (
    <div className="pt-2 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="i-label shrink-0" style={{ color: "var(--i-text-faint)", fontSize: 9 }}>
          {label}
        </span>
        <span className="i-readout truncate text-right text-[12px]" style={{ color: tone }}>
          {value}
        </span>
      </div>
      {note ? (
        <p className="pt-0.5 text-[10px] leading-snug" style={{ color: "var(--i-text-faint)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The "so what". One sentence, in a person's words, about what the thing
    above actually does to the project. */
function Consequence({ text }: { text: string }) {
  return (
    <p
      data-shoot="cr-consequence"
      className="mt-3 rounded px-2.5 py-2 text-[10.5px] leading-snug"
      style={{ background: "var(--i-recess)", color: "var(--i-text-soft)" }}
    >
      {text}
    </p>
  );
}
