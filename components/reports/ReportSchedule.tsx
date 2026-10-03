import type { DecisionBriefV1 } from "@/lib/reports/decisionBrief";

export default function ReportSchedule({ brief }: { brief: DecisionBriefV1 }) {
  const schedule = brief.timeline.schedule;
  if (!schedule) return <p>Full schedule was not captured in this historical report.</p>;
  const events = schedule.value.events;
  const times = events.flatMap((event) => [Date.parse(event.date), Date.parse(event.endDate ?? event.date)]).filter(Number.isFinite);
  const min = Math.min(...times), max = Math.max(...times);
  const span = Math.max(86400000, max - min);
  return <section aria-label="Captured schedule" data-shoot="report-schedule" style={{ marginTop: 16 }}>
    <h3>Accepted schedule at generation</h3>
    <p style={{ fontSize: 12 }}>Plans and commitments are not forecast outcomes. These landmarks do not schedule resources or move the forecast.</p>
    {!events.length ? <p>No accepted schedule landmarks were recorded.</p> : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr><th style={{ textAlign: "left" }}>Landmark</th><th style={{ textAlign: "left" }}>Dates / status</th><th style={{ width: "30%" }}>Schedule snapshot</th></tr></thead>
      <tbody>{events.map((event) => {
        const left = (Date.parse(event.date) - min) / span * 94;
        const width = Math.max(1, (Date.parse(event.endDate ?? event.date) - Date.parse(event.date)) / span * 94);
        return <tr key={event.id} style={{ breakInside: "avoid", borderTop: "1px solid #c9d1d9" }}>
          <td style={{ padding: "10px 8px 10px 0", verticalAlign: "top" }}><strong>{event.title}</strong>
            <details open><summary>Source and evidence</summary><p>{event.sourceLabel ?? event.source ?? "Source not recorded"}</p>
              {event.evidence?.length ? event.evidence.map((passage) => <blockquote key={passage.passageId}><p>{passage.quote}</p><small>{passage.sourceRef} · {passage.passageId}</small></blockquote>) : <p>No exact passage captured for this landmark.</p>}
              {event.contextSnapshotId && <small>Snapshot {event.contextSnapshotId}</small>}
            </details>
          </td>
          <td style={{ verticalAlign: "top", padding: 10 }}>{event.date}{event.endDate ? ` → ${event.endDate}` : ""}<br />{event.temporalState} · {event.semanticState ?? "event"}</td>
          <td><div aria-hidden style={{ height: 14, position: "relative", background: "#e5eaf0", borderRadius: 4 }}><div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, minWidth: 5, height: 14, borderRadius: 3, background: event.temporalState === "occurred" ? "#24746b" : "#7653ba" }} /></div></td>
        </tr>;
      })}</tbody>
    </table>}
  </section>;
}
