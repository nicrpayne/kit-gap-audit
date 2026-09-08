import type { InteractiveBriefBundleV1 } from "@/lib/reports/publicationContract";
import { formatDateOnly, formatInstant, toInstant } from "@/lib/time/dateContract";
import styles from "./InteractiveBriefSitePreview.module.css";

const date = (value: string | null) => value ? formatDateOnly(value, { month: "short", day: "numeric", year: "numeric" }) : "Unavailable";
const instant = (value: string) => formatInstant(toInstant(value), { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

export default function InteractiveBriefSitePreview({ bundle }: { bundle: InteractiveBriefBundleV1 }) {
  const delivery = bundle.content.delivery;
  const change = bundle.content.whatChanged;
  const firstDecision = bundle.content.decisions[0];
  const firstAsk = bundle.content.leadershipAsks[0];
  const next = bundle.content.next;
  const stale = [...new Map(bundle.provenance
    .filter((item) => item.currentness === "stale")
    .map((item) => [`${item.owner}:${item.asOf}`, item])).values()];
  return <main className={styles.site} data-bundle-hash={bundle.integrity.bundleHash} data-snapshot-fingerprint={bundle.integrity.snapshotFingerprint}>
    <div className={styles.wrap}>
      <div className={styles.topbar}><div className={styles.wordmark}>{bundle.identity.projectName}</div><div className={styles.topmeta}>{bundle.identity.audienceLabel} · {bundle.identity.purposeLabel}<br />Frozen {instant(bundle.identity.generatedAt)}</div></div>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>{delivery.status === "available" ? "Delivery outlook" : "Delivery truth incomplete"}</div>
        <h1 className={styles.title}>{delivery.status === "available" ? `Likely ${date(delivery.likely)}` : "Forecast unavailable"}</h1>
        <p className={styles.outcome}>{bundle.content.outcome}</p>
        {stale.length > 0 && <div className={styles.honesty}><strong>Stale owner data.</strong> {stale.map((item) => `${item.owner} as of ${instant(item.asOf)}`).join(" · ")}. This brief does not silently refresh.</div>}
        {delivery.status === "unavailable" && <div className={styles.honesty}><strong>Forecast unavailable.</strong> {delivery.unavailableReason} Missing data is preserved rather than converted into a date.</div>}
        <div className={styles.stateGrid}>
          <div className={`${styles.state} ${styles.statePrimary}`}><div className={styles.label}>Likely</div><div className={styles.value}>{date(delivery.likely)}</div><div className={styles.sub}>{delivery.earliest && delivery.latest ? `${date(delivery.earliest)} – ${date(delivery.latest)}` : "No executable forecast window"}</div></div>
          <div className={styles.state}><div className={styles.label}>Target</div><div className={styles.value}>{date(delivery.target)}</div><div className={styles.sub}>{delivery.target ? delivery.confidenceAtTarget === null ? "Confidence unavailable" : `${delivery.confidenceAtTarget}% confidence at target` : "No planning target"}</div></div>
          <div className={styles.state}><div className={styles.label}>Committed</div><div className={styles.value}>{delivery.commitment.date ? date(delivery.commitment.date) : "None"}</div><div className={styles.sub}>{delivery.commitment.status === "missing" ? "No canonical delivery commitment" : delivery.commitment.label}</div></div>
        </div>
      </section>
      <section className={styles.answerGrid} aria-label="Leadership answers">
        <article className={styles.answer}><div className={styles.label}>Why this date</div><h2>Supported drivers</h2><ul>{bundle.content.whyThisDate.slice(0, 3).map((item) => <li key={item.id}><strong>{item.label}</strong><br />{item.detail}</li>)}{bundle.content.whyThisDate.length === 0 && <li>No supported delivery driver is available.</li>}</ul></article>
        <article className={styles.answer}><div className={styles.label}>What can change it</div><h2>Calls and dependencies</h2><p>{firstDecision ? `${firstDecision.title}${firstDecision.gated ? ` · ${firstDecision.modeledDelay.likely} likely serial days` : " · ungated, zero modeled delay"}` : bundle.content.dependencies[0]?.name ?? "No supported change lever in this snapshot."}</p></article>
        <article className={styles.answer}><div className={styles.label}>What changed</div><h2>{change ? `${change.newFindingCount} new · ${change.resolvedFindingCount} resolved` : "Not included"}</h2><p>{change ? `${change.shippedCount} shipped item${change.shippedCount === 1 ? "" : "s"}.` : "This audience recipe omits the change module."}</p></article>
        <article className={styles.answer}><div className={styles.label}>What is committed</div><h2>{delivery.commitment.status === "missing" ? "No delivery commitment" : date(delivery.commitment.date)}</h2><p>Likely and target remain planning signals; neither is promoted into a promise.</p></article>
        <article className={styles.answer}><div className={styles.label}>What do you need from me</div><h2>{firstAsk ? "One confirmed ask" : "No confirmed ask"}</h2><p>{firstAsk?.label ?? "Signal has not promoted a candidate into a leadership ask."}</p></article>
        <article className={styles.answer}><div className={styles.label}>What’s next</div><h2>{next?.title ?? "Milestone missing"}</h2><p>{next ? date(next.date) : "No next milestone is present in this frozen recipe."}</p></article>
      </section>
      <section className={styles.section} id="detail"><div className={styles.sectionHead}><h2>Explore the frozen brief</h2><div className={styles.label}>Read only · no live Signal access</div></div>
        <details className={styles.detail} open><summary>Delivery drivers <span>{bundle.content.whyThisDate.length}</span></summary><div className={styles.detailContent}>{bundle.content.whyThisDate.map((item) => <p key={item.id}><strong>{item.label}</strong> — {item.detail}</p>)}</div></details>
        <details className={styles.detail}><summary>Decisions and asks <span>{bundle.content.decisions.length + bundle.content.leadershipAsks.length}</span></summary><div className={styles.detailContent}>{bundle.content.decisions.map((item) => <p key={item.id}><strong>{item.title}</strong> — {item.gated ? "gated" : "ungated"}; owner {item.owner ?? "unassigned"}; needed {date(item.neededBy)}.</p>)}{!bundle.content.decisions.length && <p>No first-class Decisions were included.</p>}</div></details>
        <details className={styles.detail}><summary>Milestones <span>{bundle.content.milestones.length}</span></summary><div className={styles.detailContent}>{bundle.content.milestones.map((item) => <p key={item.id}><strong>{item.title}</strong> — {date(item.date)} · {item.temporalState}.</p>)}{!bundle.content.milestones.length && <p>No milestone was included.</p>}</div></details>
        <details className={styles.detail} open={bundle.content.caveats.length > 0}><summary>Missing inputs and caveats <span>{bundle.content.caveats.length}</span></summary><div className={styles.detailContent}>{bundle.content.caveats.map((item) => <p key={item.code}><strong>{item.code}</strong> — {item.message}</p>)}{!bundle.content.caveats.length && <p>No explicit caveats from the frozen owner reads.</p>}</div></details>
        {bundle.content.scenarioCompare && <details className={styles.detail}><summary>Frozen scenario comparison <span>{bundle.content.scenarioCompare.options.length}</span></summary><div className={styles.detailContent}><p>This comparison cannot mutate Signal or recompute its consequences.</p>{bundle.content.scenarioCompare.options.map((item) => <p key={item.id}><strong>{item.label}</strong> — likely {date(item.likelyDate)} · {Math.abs(item.deltaDays)} days {item.deltaDays < 0 ? "sooner" : "later"}.</p>)}</div></details>}
      </section>
      <footer className={styles.footer}>Frozen from Signal report <span className={styles.mono}>{bundle.identity.reportId}</span> · snapshot <span className={styles.mono}>{bundle.integrity.snapshotFingerprint}</span> · bundle <span className={styles.mono}>{bundle.integrity.bundleHash.slice(0, 16)}…</span></footer>
    </div>
  </main>;
}
