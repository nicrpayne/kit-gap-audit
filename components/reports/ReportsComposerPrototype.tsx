"use client";

import type React from "react";
import { useMemo, useState } from "react";
import type { DecisionBriefV1 } from "@/lib/reports/decisionBrief";
import {
  AUDIENCE_LABELS,
  MODULE_CATALOG,
  PURPOSE_LABELS,
  buildBriefRecipe,
  moduleDefinition,
  moveRecipeModule,
  setRecipeModuleDensity,
  toggleRecipeModule,
  type AudienceLens,
  type BriefModuleId,
  type BriefPurpose,
  type BriefRecipeV1,
  type ModuleDensity,
} from "@/lib/reports/composer";
import { buildBriefPresentation, buildInteractiveBriefBundle, siteHandoffPrompt, sourceForModule } from "@/lib/reports/presentation";
import { renderAudienceBriefMarkdown, renderAudienceBriefPlainText } from "@/lib/reports/audienceBriefRender";
import AudienceBriefView, { BriefModule } from "./AudienceBriefView";
import styles from "./ReportsComposer.module.css";

type Surface = "compose" | "brief" | "site";

export default function ReportsComposerPrototype({ brief }: { brief: DecisionBriefV1 }) {
  const [recipe, setRecipe] = useState<BriefRecipeV1>(() => buildBriefRecipe("delivery-leadership", "weekly-update", brief));
  const [surface, setSurface] = useState<Surface>("compose");
  const [selectedId, setSelectedId] = useState<BriefModuleId>(recipe.modules[0].id);
  const [draggingId, setDraggingId] = useState<BriefModuleId | null>(null);
  const presentation = useMemo(() => buildBriefPresentation(brief, recipe), [brief, recipe]);
  const selected = moduleDefinition(selectedId);
  const active = new Set(recipe.modules.map((item) => item.id));
  const selectedConfig = recipe.modules.find((item) => item.id === selectedId);
  const bundle = useMemo(() => buildInteractiveBriefBundle(brief, recipe), [brief, recipe]);

  function changePreset(audience: AudienceLens, purpose = recipe.purpose) {
    const next = buildBriefRecipe(audience, purpose, brief);
    setRecipe(next);
    setSelectedId(next.modules[0].id);
  }

  function changePurpose(purpose: BriefPurpose) {
    const next = buildBriefRecipe(recipe.audience, purpose, brief);
    setRecipe({ ...next, promotedAskIds: recipe.promotedAskIds, operatorNote: recipe.operatorNote });
    setSelectedId(next.modules[0].id);
  }

  async function copy(kind: "markdown" | "plain" | "bundle" | "handoff") {
    const value = kind === "markdown" ? renderAudienceBriefMarkdown(brief, recipe)
      : kind === "plain" ? renderAudienceBriefPlainText(brief, recipe)
      : kind === "bundle" ? JSON.stringify(bundle, null, 2)
      : siteHandoffPrompt(bundle);
    await navigator.clipboard.writeText(value);
  }

  return <div className={styles.shell} data-composer-version={recipe.version} data-snapshot-fingerprint={presentation.snapshotFingerprint}>
    <div className={styles.transport} data-shoot="composer-transport">
      <div className={styles.brand}>REPORT COMPOSER</div>
      <div className={styles.transportGroup}><div><div className={styles.label}>Audience</div><select className={styles.control} value={recipe.audience} onChange={(event) => changePreset(event.target.value as AudienceLens)}>{Object.entries(AUDIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><div className={styles.label}>Purpose</div><select className={styles.control} value={recipe.purpose} onChange={(event) => changePurpose(event.target.value as BriefPurpose)}>{Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      <div className={styles.transportGroup}><span className={styles.mode}>● Reality</span><span className={styles.label}>Compare · {recipe.compareTo ?? "none"}</span></div>
      <div className={styles.transportGroup} style={{ marginLeft: "auto" }}>{(["compose", "brief", "site"] as const).map((item) => <button key={item} className={`${styles.button} ${surface === item ? styles.buttonActive : ""}`} onClick={() => setSurface(item)}>{item === "compose" ? "Composer" : item === "brief" ? "Finished brief" : "Site handoff"}</button>)}</div>
    </div>

    {surface === "compose" ? <div className={styles.workspace}>
      <aside className={styles.browser} data-shoot="module-browser"><div className={styles.railTitle}>Module browser · {active.size} active</div>{MODULE_CATALOG.map((module) => <button key={module.id} className={styles.moduleChoice} data-active={active.has(module.id)} data-selected={selectedId === module.id} onClick={() => { setSelectedId(module.id); setRecipe(toggleRecipeModule(recipe, module.id)); }}><span className={styles.dot} /><span>{module.shortLabel}</span><span className={styles.label}>{module.owner}</span></button>)}</aside>
      <main className={styles.rack} data-shoot="composer-rack">
        <div className={styles.rackHeader}><div><div className={styles.label}>Arrangement</div><div className={styles.rackTitle}>{presentation.audienceLabel}</div></div><div className={styles.rackMeta}>{presentation.purposeLabel} · frozen {presentation.snapshotFingerprint}</div></div>
        {recipe.modules.map((module) => <div key={module.id} className={styles.rackModule} data-selected={selectedId === module.id} style={{ "--tone": ({ reality: "#45bfd2", choice: "#9885ff", capacity: "#e5b84b", outcome: "#42d7aa", time: "#7d9eff", attention: "#e5b84b" } as Record<string, string>)[moduleDefinition(module.id).tone] } as React.CSSProperties}><BriefModule module={module} brief={brief} recipe={recipe} open={selectedId === module.id || module.density === "expanded"} draggable onSelect={() => setSelectedId(module.id)} onDragStart={() => setDraggingId(module.id)} onDrop={() => { if (draggingId) setRecipe(moveRecipeModule(recipe, draggingId, module.id)); setDraggingId(null); }} /></div>)}
      </main>
      <aside className={styles.inspector} data-shoot="module-inspector"><div className={styles.railTitle}>Module inspector</div><div className={styles.inspectorTitle}>{selected.label}</div><p className={styles.inspectorCopy}>{selected.description}</p>{selectedConfig && <><div className={styles.density}>{selected.densities.map((density) => <button key={density} data-active={selectedConfig.density === density} onClick={() => setRecipe(setRecipeModuleDensity(recipe, selected.id, density as ModuleDensity))}>{density}</button>)}</div><div className={styles.fact}><div className={styles.label}>Truth owner</div><strong>{selected.owner}</strong></div><div className={styles.fact}><div className={styles.label}>Frozen binding</div>{selected.bindings.map((binding) => <strong key={binding}>{binding}</strong>)}</div><div className={styles.fact}><div className={styles.label}>Can say</div>{selected.facts.map((fact) => <strong key={fact}>{fact}</strong>)}</div><div className={styles.fact}><div className={styles.label}>As-of</div><strong>{sourceForModule(brief, selected.id).asOf} · {sourceForModule(brief, selected.id).currentness}</strong></div></>}{selected.id === "leadership-asks" && <div className={styles.fact}><div className={styles.label}>Promote candidate</div>{brief.calls.decisions.value.map((decision) => <label key={decision.id} className={styles.inspectorCopy} style={{ display: "block" }}><input type="checkbox" checked={recipe.promotedAskIds.includes(decision.id)} onChange={() => setRecipe({ ...recipe, promotedAskIds: recipe.promotedAskIds.includes(decision.id) ? recipe.promotedAskIds.filter((id) => id !== decision.id) : [...recipe.promotedAskIds, decision.id] })} /> {decision.title}</label>)}</div>}<div className={styles.fact}><button className={styles.button} onClick={() => setRecipe(toggleRecipeModule(recipe, selected.id))}>{active.has(selected.id) ? "Remove module" : "Add module"}</button></div></aside>
    </div> : surface === "brief" ? <div><div className={styles.transport}><button className={styles.button} onClick={() => copy("markdown")}>Copy Markdown</button><button className={styles.button} onClick={() => copy("plain")}>Copy plain text</button><a className={styles.button} href="/reports/composer/fixture/print" target="_blank" rel="noreferrer">Print view</a><span className={styles.label} style={{ marginLeft: "auto" }}>Same immutable payload · same module recipe</span></div><AudienceBriefView brief={brief} recipe={recipe} /></div>
    : <div><div className={styles.transport}><button className={styles.button} onClick={() => copy("bundle")}>Copy bundle JSON</button><button className={styles.button} onClick={() => copy("handoff")}>Copy @Sites handoff</button><span className={styles.label} style={{ marginLeft: "auto" }}>Private review · no live access · publishing not authorized</span></div><AudienceBriefView brief={brief} recipe={recipe} sitePreview /></div>}
  </div>;
}
