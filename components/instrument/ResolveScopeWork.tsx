"use client";
import { useState } from "react";
import ToolWindow from "@/components/instrument/ToolWindow";
import type { ScopeWorkItem } from "@/lib/instrument/useProject";

export interface WorkResolution {
  capabilityId: string | null; expectedRevision?: number; name?: string;
  status?: "accepted" | "outside"; note?: string; workItemIds: string[];
}

export default function ResolveScopeWork({ item, capabilities, saving, error, onClose, onSave }: {
  item: ScopeWorkItem;
  capabilities: { id: string; name: string; status: string; revision: number }[];
  saving: boolean; error: string | null; onClose: () => void;
  onSave: (input: WorkResolution) => void;
}) {
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const selected = capabilities.find((capability) => capability.id === target);
  const creating = target === "new-in" || target === "new-out";
  const outside = target === "new-out" || (selected && selected.status !== "accepted");
  const destination = selected?.name ?? name.trim();
  const valid = Boolean(selected || (creating && name.trim()));
  const inputStyle = { background: "var(--i-recess)", border: "1px solid var(--i-border-strong)" };
  return <ToolWindow open onClose={() => { if (!saving) onClose(); }} title="Resolve ticket" subtitle={item.id} width={520} dataShoot="resolve-scope-work"
    footer={<div className="space-y-3 p-5">
      {error && <p role="alert" className="text-[12px] text-[var(--i-red)]">{error}</p>}
      <button disabled={saving || !valid} className="w-full rounded-md border border-[var(--i-signal)] px-4 py-3 text-[12px] text-[var(--i-signal)] disabled:opacity-40" onClick={() => onSave({
        capabilityId: selected?.id ?? null, expectedRevision: selected?.revision,
        ...(creating ? { name: name.trim(), status: target === "new-out" ? "outside" : "accepted" } : {}),
        ...(note.trim() ? { note: note.trim() } : {}), workItemIds: [item.id],
      })}>{saving ? "Saving and checking…" : "Save ticket assignment"}</button>
      <p className="text-[11px] text-[var(--i-text-faint)]">This updates shared Reality, not a Scenario. Nothing is changed in Linear.</p>
    </div>}>
    <div className="space-y-5 p-5 text-[13px]">
      <div><h2 className="text-[17px] font-semibold leading-snug">{item.label}</h2>
        <p className="mt-2 text-[var(--i-text-soft)]">{item.state ?? "Status unavailable"} · {item.assignee ?? "Unassigned"}</p>
        {item.parentIdentifier && <p className="mt-1 text-[12px] text-[var(--i-text-faint)]">Parent: {item.parentIdentifier} · {item.parentTitle}</p>}
        {item.description && <p className="mt-3 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--i-text-soft)]">{item.description}</p>}
        {item.externalUrl && /^https:\/\//.test(item.externalUrl) && <a className="mt-3 inline-block text-[var(--i-signal)] underline" href={item.externalUrl} target="_blank" rel="noreferrer">Read full ticket in Linear ↗</a>}
      </div>
      <fieldset disabled={saving} className="space-y-4">
        <label className="block">Where does this ticket belong?
          <select autoFocus aria-label="Assign ticket to" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-2 w-full rounded-md p-3" style={inputStyle}>
            <option value="">Choose a feature or create one…</option>
            <optgroup label="In this release">{capabilities.filter((c) => c.status === "accepted").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="Out / later">{capabilities.filter((c) => c.status !== "accepted").map((c) => <option key={c.id} value={c.id}>{c.name} — out / later</option>)}</optgroup>
            <option value="new-in">+ New feature in this release</option>
            <option value="new-out">+ New out / later feature</option>
          </select>
        </label>
        {creating && <label className="block">Feature name<input aria-label="New feature name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-md p-3" style={inputStyle} /></label>}
        <label className="block">Reason (optional)<input value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 w-full rounded-md p-3" style={inputStyle} /></label>
      </fieldset>
      {valid && <div role="status" className="rounded-lg border border-[var(--i-border)] p-4 leading-relaxed" data-shoot="ticket-assignment-preview">
        <strong>{item.id} → {destination}</strong>
        <p className="mt-2 text-[var(--i-text-soft)]">{outside ? "Out / later: excluded from this release’s forecast." : "In this release: its remaining work will count toward this feature."} {creating ? "A new feature will be created." : "Only this ticket’s assignment changes."}</p>
      </div>}
    </div>
  </ToolWindow>;
}
