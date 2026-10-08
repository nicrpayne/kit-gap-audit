"use client";
import {useState} from "react";
import {isSignalEstimate, parseSignalEstimateInput, type AcceptedSignalEstimate, type SignalEstimateInput} from "@/lib/scope/signalEstimates";
import type {Feature} from "@/lib/scope/features";

export function RemainingEstimateEditor({feature, draft, busy, onTry, onAccept, onClearDraft}: {
  feature:Feature; draft?:AcceptedSignalEstimate; busy:boolean;
  onTry:(input:SignalEstimateInput)=>void|Promise<void>; onAccept:(input:SignalEstimateInput)=>void|Promise<void>; onClearDraft:()=>void;
}) {
  const saved = isSignalEstimate(feature.canonicalCapability?.acceptedEstimate) ? feature.canonicalCapability.acceptedEstimate : null;
  const initial = () => {
    const input = draft?.input ?? saved?.input;
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    return {alreadyDone:input?.alreadyDone ?? "", reuseFrom:input?.reuseFrom ?? "", remainingWork:input?.remainingWork ?? "", rationale:input?.rationale ?? "", evidenceReference:input?.evidenceReference ?? "", asOfDate:input?.asOfDate ?? localDate, reviewerDisplayName:input?.reviewerDisplayName ?? "", low:input ? String(input.range.low) : "", likely:input ? String(input.range.likely) : "", high:input ? String(input.range.high) : ""};
  };
  const [form,setForm] = useState(initial);
  const [covered,setCovered] = useState<string[]>(draft?.input.coveredOpenItemIds ?? saved?.input.coveredOpenItemIds ?? feature.items.map(item=>item.id));
  const [error,setError] = useState<string|null>(null);
  // Scope keys this editor by card and estimate identity. Unrelated refreshes
  // keep unfinished typing; selecting another estimate starts a fresh form.
  if (!feature.canonicalCapability || feature.canonicalCapability.status !== "accepted") return null;
  const field=(key:keyof typeof form,label:string,placeholder:string,required=false)=><label className="block text-[11px] text-[var(--i-text-soft)]">{label}{required ? " *" : ""}<textarea aria-label={label} rows={2} value={form[key]} maxLength={8000} onChange={e=>setForm(old=>({...old,[key]:e.target.value}))} placeholder={placeholder} className="mt-1 w-full rounded px-3 py-2 text-[12px]" style={{background:"var(--i-recess)",border:"1px solid var(--i-border)"}} /></label>;
  const submit=async(action:"try"|"accept")=>{
    try {
      if (![form.low,form.likely,form.high].every(value=>value.trim())) throw new Error("Enter best, likely, and worst remaining effort.");
      const input=parseSignalEstimateInput({...form,range:{low:Number(form.low),likely:Number(form.likely),high:Number(form.high)},coveredOpenItemIds:feature.items.filter(item=>covered.includes(item.id)).map(item=>item.id),additionalOpenItemIds:feature.items.filter(item=>!covered.includes(item.id)).map(item=>item.id)});
      if(feature.items.length && !input.coveredOpenItemIds.length) throw new Error("Select at least one covered ticket.");
      setError(null); await (action==="try" ? onTry(input) : onAccept(input));
    } catch(e) {setError(e instanceof Error ? e.message : "Review the estimate.");}
  };
  return <section className="mx-5 mt-4 rounded-lg p-4 space-y-3" style={{border:"1px solid var(--i-signal)",background:"var(--i-panel-raised)"}} data-shoot="remaining-estimate-editor">
    <div><h3 className="text-[14px] font-semibold text-[var(--i-text)]">What’s left to deliver?</h3><p className="mt-1 text-[11px] text-[var(--i-text-soft)]">Estimate this card in developer-days, independent of Linear’s story points. Count adaptation, integration, review, and testing—not work already done.</p></div>
    {draft && <p className="text-[11px] text-[var(--i-violet)]">Trying a remaining-work estimate in Scenario. Reality is unchanged. <button onClick={onClearDraft} className="underline">Clear experiment</button></p>}
    {saved && !draft && <p className="text-[11px] text-[var(--i-mint)]">Saved Signal estimate · {saved.input.range.low}–{saved.input.range.likely}–{saved.input.range.high} developer-days · as of {saved.input.asOfDate}</p>}
    {field("alreadyDone","Already done","What is implemented or complete already?")}
    {field("reuseFrom","Reuse from","For example: JSA’s file-upload component and service. Note any compatibility assumptions.")}
    {field("remainingWork","Still needed","What must change, be connected, reviewed, and tested?",true)}
    <div className="grid grid-cols-3 gap-2">{([['low','Best'],['likely','Likely'],['high','Worst']] as const).map(([key,label])=><label key={key} className="text-[11px]">{label} days *<input aria-label={`Remaining ${label.toLowerCase()} days`} type="number" min="0" step="0.25" value={form[key]} onChange={e=>setForm(old=>({...old,[key]:e.target.value}))} className="mt-1 w-full rounded p-2 text-[13px]" style={{background:"var(--i-recess)",border:"1px solid var(--i-border)"}} /></label>)}</div>
    {field("rationale","Why this range","Explain the remaining effort and uncertainties. Reuse is not assumed to be free.",true)}
    <details><summary className="cursor-pointer text-[11px]">Covered tickets · {feature.items.filter(item=>covered.includes(item.id)).length} of {feature.items.length}</summary>
      <p className="mt-2 text-[10px] text-[var(--i-text-soft)]">Checked tickets are replaced by this one range. Unchecked tickets stay additional and are counted separately. Nothing is removed from Linear.</p>
      {feature.items.map(item=><label key={item.id} className="mt-2 flex gap-2 text-[11px]"><input type="checkbox" checked={covered.includes(item.id)} onChange={e=>setCovered(old=>e.target.checked?[...old,item.id]:old.filter(id=>id!==item.id))} />{item.label}</label>)}
      {!feature.items.length && <p className="mt-2 text-[11px]">No linked open tickets. “Still needed” describes the work; this does not clear unresolved Scope coverage.</p>}
    </details>
    {field("evidenceReference","Supporting reference (optional)","A ticket, component, conversation reference, or note. This does not claim an exact transcript quote.")}
    <div className="grid grid-cols-2 gap-2"><label className="text-[11px]">As of *<input aria-label="Estimate as of" type="date" value={form.asOfDate} onChange={e=>setForm(old=>({...old,asOfDate:e.target.value}))} className="mt-1 w-full rounded p-2" style={{background:"var(--i-recess)",border:"1px solid var(--i-border)"}} /></label><label className="text-[11px]">Your name / reviewer label *<input aria-label="Estimate reviewer" value={form.reviewerDisplayName} onChange={e=>setForm(old=>({...old,reviewerDisplayName:e.target.value}))} className="mt-1 w-full rounded p-2" style={{background:"var(--i-recess)",border:"1px solid var(--i-border)"}} /></label></div>
    <p className="text-[10px] text-[var(--i-text-faint)]">Your planning judgment, not a developer quote or verified reuse claim. Effort is separate from a delivery date. This does not assign people or schedule resource handoffs.</p>
    <p className="text-[10px] text-[var(--i-amber)]">Accepting sets this card’s Reality estimate. Any previous estimate and its evidence remain in saved history.</p>
    {error && <p role="alert" className="text-[11px] text-[var(--i-amber)]">{error}</p>}
    <div className="grid grid-cols-2 gap-2"><button disabled={busy} onClick={()=>submit("try")} className="rounded p-2.5 text-[12px] disabled:opacity-40" style={{border:"1px solid var(--i-violet)",color:"var(--i-violet)"}}>Try in Scenario</button><button disabled={busy} onClick={()=>submit("accept")} className="rounded p-2.5 text-[12px] disabled:opacity-40" style={{border:"1px solid var(--i-signal)",color:"var(--i-signal)"}}>Accept into Reality</button></div>
  </section>;
}
export default RemainingEstimateEditor;
