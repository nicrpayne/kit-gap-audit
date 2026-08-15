"use client";

// THE PORTFOLIO MIXER -- the control surface under the forecast field.
//
// People are the resource. Projects are the channels. You cannot create a
// channel's capacity by turning it up; you move capacity into it from
// somewhere, and the machine says where from. That is the whole instrument.
//
// Layout follows the approved contract: real project channels left to
// right, scrolling if there are more than fit, and the Master bus PINNED
// right so the physical truth never scrolls out of view. Suggested moves
// sit under the channels, where a tension appears and is resolved.

import { useMemo } from "react";
import MixerChannel, { DormantChannel, CHANNEL_W, RACK_H, type ChannelView } from "./MixerChannel";
import MasterBus from "./MasterBus";
import type { MasterReading, DonorSuggestion, SplitPersonView } from "@/lib/capacity/workforce";

// Channel identity only -- a hue to find your project by, at dot and trace
// scale. The instrument's semantic colours are untouched: violet still
// means "this carries a scenario change", amber still means friction, red
// still means the portfolio cannot do what is being asked.
export const CHANNEL_ACCENTS = ["#9b8cfa", "#46c3d6", "#4ad9a8", "#e0b04a", "#ef8f5b", "#8fa6c4"];

interface Props {
  channels: ChannelView[];
  master: MasterReading;
  faderMax: number;
  selectedScopeId: string | null;
  contextSwitchCostPct: number;
  reductionRequired: number;
  inheritedFte: number;
  /** The channel currently asking for people that do not exist, if any. */
  deficitScopeId: string | null;
  deficitFte: number;
  donors: DonorSuggestion[];
  scopeNameById: Map<string, string>;
  splits: SplitPersonView[];
  onSelect: (scopeId: string) => void;
  onFader: (scopeId: string, raw: number) => void;
  onTakeFrom: (donorScopeId: string) => void;
  onSplitSomeone: () => void;
  onHire: (fte: number) => void;
  onContextSwitch: (pct: number) => void;
  onWorkforce: (fte: number) => void;
  onOpenSplits: (scopeId: string | null) => void;
  onOpenGates: (scopeId: string) => void;
  onExplainSwitchCost: () => void;
  /** Channel under the pointer -- wakes its swim lane above. */
  hoveredScopeId: string | null;
  onHover: (scopeId: string | null) => void;
  /** The two channels mid-transfer; both wake, everything else recedes. */
  transferPair: string[];
  /** How many physical positions the rack keeps beyond the live projects. */
  dormantCount: number;
}

export default function PortfolioMixer({
  channels,
  master,
  faderMax,
  selectedScopeId,
  contextSwitchCostPct,
  reductionRequired,
  inheritedFte,
  deficitScopeId,
  deficitFte,
  donors,
  scopeNameById,
  splits,
  onSelect,
  onFader,
  onTakeFrom,
  onSplitSomeone,
  onHire,
  onContextSwitch,
  onWorkforce,
  onOpenSplits,
  onOpenGates,
  onExplainSwitchCost,
  hoveredScopeId,
  onHover,
  transferPair,
  dormantCount,
}: Props) {
  const indexByScope = useMemo(
    () => new Map(channels.map((c, i) => [c.scopeId, i])),
    [channels]
  );

  return (
    <div className="shrink-0 flex flex-col" style={{ background: "var(--i-void)", borderTop: "1px solid var(--i-border)" }}>
      <div className="flex items-stretch gap-2 px-4 py-2.5">
        {/* THE PROJECT BANK. Fixed-width strips at fixed positions -- the
            rack's geometry belongs to the rack, not to how many projects
            happen to exist today. Only this scrolls; the Master never moves. */}
        <div className="flex-1 min-w-0 overflow-x-auto" data-shoot="mixer-channels">
          <div className="flex items-stretch gap-2" style={{ minHeight: RACK_H }}>
            {channels.map((view, i) => (
              <MixerChannel
                key={view.scopeId}
                index={i + 1}
                view={view}
                faderMax={faderMax}
                selected={view.scopeId === selectedScopeId}
                hovered={hoveredScopeId === view.scopeId || transferPair.includes(view.scopeId)}
                dimmed={
                  (transferPair.length > 0 && !transferPair.includes(view.scopeId)) ||
                  (!!hoveredScopeId && hoveredScopeId !== view.scopeId && transferPair.length === 0)
                }
                onSelect={() => onSelect(view.scopeId)}
                onHover={(on) => onHover(on ? view.scopeId : null)}
                onFader={(raw) => onFader(view.scopeId, raw)}
                onOpenSplits={() => onOpenSplits(view.scopeId)}
                onOpenGates={() => onOpenGates(view.scopeId)}
              />
            ))}
            {/* Powered-off strips fill the rack to its physical width. */}
            {Array.from({ length: dormantCount }, (_, i) => (
              <DormantChannel key={`dormant-${i}`} index={channels.length + i + 1} />
            ))}
          </div>
        </div>

        <MasterBus
          reading={master}
          contextSwitchCostPct={contextSwitchCostPct}
          onContextSwitch={onContextSwitch}
          onWorkforce={onWorkforce}
          reductionRequired={reductionRequired}
          inheritedFte={inheritedFte}
          onExplainSwitchCost={onExplainSwitchCost}
        />
      </div>

      {/* ── SPLIT BRIDGE ─────────────────────────────────────────────────
          Who is shared, and between what. One compact line per split human
          rather than cables across the whole surface -- you should be able
          to glance and see "these two channels share a person", not read a
          wiring diagram. */}
      {splits.length > 0 && (
        <div
          className="px-4 py-2 flex items-center gap-2 overflow-x-auto"
          data-shoot="split-bridge"
          style={{ borderTop: "1px solid var(--i-border)", background: "var(--i-bg)" }}
        >
          <span className="i-label shrink-0" style={{ color: "var(--i-amber)" }}>
            Shared
          </span>
          {splits.slice(0, 6).map((s) => (
            <button
              key={s.personId}
              onClick={() => onOpenSplits(null)}
              data-shoot="bridge-person"
              className="shrink-0 flex items-center gap-1.5 rounded-md px-2 py-1 text-[9.5px] transition-colors hover:brightness-125"
              style={{ background: "var(--i-panel)", border: "1px solid var(--i-border)", color: "var(--i-text-soft)" }}
              title={`${s.label} · ${s.rawFte.toFixed(2)} FTE raw, ${s.effectiveFte.toFixed(2)} effective`}
            >
              <span className="text-[var(--i-text)]">{s.label}</span>
              {s.lines.map((l, i) => (
                <span key={l.scopeId} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[var(--i-text-faint)]">·</span>}
                  <span
                    className="h-[6px] w-[6px] rounded-full"
                    style={{ background: CHANNEL_ACCENTS[(indexByScope.get(l.scopeId) ?? 0) % CHANNEL_ACCENTS.length] }}
                    aria-hidden
                  />
                  <span className="tabular-nums">{Math.round(l.fraction * 100)}%</span>
                </span>
              ))}
              <span className="text-[var(--i-amber)]">−{(s.rawFte - s.effectiveFte).toFixed(2)}</span>
            </button>
          ))}
          {splits.length > 6 && (
            <span className="shrink-0 text-[9.5px] text-[var(--i-text-faint)]">+{splits.length - 6} more</span>
          )}
        </div>
      )}

      {/* ── CAPACITY TENSION RAIL ────────────────────────────────────────
          Not a validation error. The machine is exposing a tension in the
          system: this much human capacity is being asked for and does not
          exist. It reads as a rail on the chassis, and every way out of it
          is a real, available physical action. */}
      {deficitScopeId && deficitFte > 1e-6 && (
        <div
          data-shoot="tension-rail"
          className="px-4 py-2.5"
          style={{
            borderTop: "1px solid rgba(239,107,91,0.35)",
            background: "linear-gradient(180deg, rgba(239,107,91,0.10) 0%, rgba(239,107,91,0.03) 100%)",
          }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[8px] uppercase tracking-[0.16em]" style={{ color: "var(--i-red)" }}>
              Capacity required
            </span>
            <span className="i-readout text-[15px] leading-none" style={{ color: "var(--i-red)" }}>
              +{deficitFte.toFixed(1)}
              <span className="text-[8px] ml-0.5 text-[var(--i-text-faint)]">FTE</span>
            </span>
            <span className="text-[9px] text-[var(--i-text-soft)]">
              on {scopeNameById.get(deficitScopeId) ?? deficitScopeId} — Reality can&rsquo;t be committed until this resolves
            </span>
          </div>

          <div
            className="mt-2 h-px"
            style={{ background: "linear-gradient(90deg, rgba(239,107,91,0.45) 0%, transparent 70%)" }}
            aria-hidden
          />

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[8px] uppercase tracking-[0.14em] text-[var(--i-text-faint)]">Take from</span>
            {donors.slice(0, 3).map((d) => (
              <button
                key={d.scopeId}
                onClick={() => onTakeFrom(d.scopeId)}
                onMouseEnter={() => onHover(d.scopeId)}
                onMouseLeave={() => onHover(null)}
                data-shoot={`take-from-${d.scopeId}`}
                className="rounded px-2 py-1 text-[9.5px] tabular-nums transition-colors hover:brightness-125"
                style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)", color: "var(--i-text)" }}
              >
                {scopeNameById.get(d.scopeId) ?? d.scopeId}
                <span style={{ color: "var(--i-red)" }}> −{Math.min(deficitFte, d.availableFte).toFixed(1)}</span>
              </button>
            ))}
            <span className="mx-1 text-[var(--i-border-strong)]">|</span>
            <button
              onClick={onSplitSomeone}
              data-shoot="split-someone"
              className="rounded px-2 py-1 text-[9.5px] hover:brightness-125"
              style={{ background: "var(--i-panel)", border: "1px solid var(--i-border-strong)", color: "var(--i-text-soft)" }}
            >
              Split a person
            </button>
            <button
              onClick={() => onHire(Math.ceil(deficitFte))}
              data-shoot="hire"
              className="rounded px-2 py-1 text-[9.5px] font-medium hover:brightness-110"
              style={{ background: "var(--i-violet)", color: "var(--i-void)" }}
            >
              Increase workforce +{Math.ceil(deficitFte).toFixed(1)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
