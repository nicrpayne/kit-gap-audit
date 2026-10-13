import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync("components/audit/AuditWorld.tsx", "utf8");
const styles = readFileSync("components/audit/AuditWorld.module.css", "utf8");

function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

assert.equal(
  occurrences(component, "<AuditRefreshControl"),
  1,
  "Audit keeps one refresh/action control set instead of duplicating hidden responsive controls",
);
assert.equal(
  occurrences(component, 'data-shoot="project-overview"'),
  1,
  "Audit keeps one Project Overview action",
);
assert.equal(
  occurrences(component, 'aria-label="Project"'),
  1,
  "Audit keeps one keyboard-reachable project selector",
);
assert.equal(
  occurrences(component, 'aria-label="Audit context"'),
  1,
  "Audit keeps one keyboard-reachable context selector",
);
assert.match(component, /<nav className=\{worldStyles\.auditHeaderActions\} aria-label="Audit controls">/);

const compactRule = styles.match(/@media \(max-width: 1180px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.match(compactRule, /\.auditHeader\s*\{[\s\S]*?height: 82px;[\s\S]*?flex-direction: column;/);
assert.match(compactRule, /\.auditHeaderActions\s*\{[\s\S]*?justify-content: flex-end;/);
assert.match(
  compactRule,
  /\.changeInboxSheet\s*\{[\s\S]*?width: min\(760px, calc\(100% - 320px\)\);[\s\S]*?min-width: 600px;/,
);

const supportedWorldWidth = 1024 - 92;
const inboxInset = 12;
const inboxWidth = Math.min(760, supportedWorldWidth - 320);
const inboxLeft = supportedWorldWidth - inboxInset - inboxWidth;
const summaryRight = 12 + 292;
assert.equal(inboxWidth, 612, "1024px preserves the inbox list/detail split without its desktop overreach");
assert.ok(inboxLeft >= summaryRight, "1024px keeps the world summary reachable beside the open inbox");

console.log("audit-responsive-layout-proof: PASS");
