import { mkdir, writeFile } from "node:fs/promises";
import { siteHandoffPrompt } from "../lib/reports/publicationContract";
import {
  executiveCompressedFixture,
  healthyLeadershipFixture,
  historicalScenarioFixture,
  incompleteNewProjectFixture,
  staleLiveOwnerFixture,
} from "./lib/publication-fixtures";

const output = "artifacts/reports-interactive-site-v1/example-bundles";
const fixtures = {
  "healthy-delivery-leadership": healthyLeadershipFixture(),
  "executive-compressed": executiveCompressedFixture(),
  "incomplete-new-project": incompleteNewProjectFixture(),
  "stale-live-owner": staleLiveOwnerFixture(),
  "historical-scenario": historicalScenarioFixture(),
};

async function main() {
  await mkdir(output, { recursive: true });
  for (const [name, bundle] of Object.entries(fixtures)) {
    await writeFile(`${output}/${name}.json`, `${JSON.stringify(bundle, null, 2)}\n`);
  }
  await writeFile(`${output}/healthy-handoff-prompt.txt`, `${siteHandoffPrompt(fixtures["healthy-delivery-leadership"])}\n`);
  console.log(`PASS exported ${Object.keys(fixtures).length} sealed publication fixtures + canonical handoff prompt`);
}

main().catch((error) => { console.error(error); process.exit(1); });
