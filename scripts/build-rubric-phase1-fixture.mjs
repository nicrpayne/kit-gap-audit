#!/usr/bin/env node

// PHASE 1 ONLY: freeze the output of Rubric's own scanner as a browser-safe
// fixture. No Signal graph data enters this path. The source directory must
// be a disposable copy of the supplied Rubric application with its workspace
// root pointed at a non-sensitive reference corpus.

import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const [, , sourceDir, outputFile, corpusDir] = process.argv;
if (!sourceDir || !outputFile) {
  throw new Error(
    "usage: build-rubric-phase1-fixture.mjs <rubric-app-dir> <output-json> [safe-corpus-dir]"
  );
}

// A supplied corpus is configured through Rubric's own normal workspace
// contract. This is not a Signal graph adapter: Rubric's scanner still walks,
// classifies, links, aggregates, and emits every node itself.
if (corpusDir) {
  const corpus = resolve(corpusDir);
  const roots = ["app", "components", "lib", "docs", "scripts", "lab/rubric-reference"];
  const visibleRoots = [""];
  const collectDirs = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = resolve(dir, entry.name);
      visibleRoots.push(relative(corpus, child).replaceAll("\\", "/"));
      collectDirs(child);
    }
  };
  for (const root of roots) collectDirs(resolve(corpus, root));

  const workspaceFile = resolve(sourceDir, "config/workspace.json");
  const workspace = JSON.parse(readFileSync(workspaceFile, "utf8"));
  workspace.root = corpus;
  workspace.visibleRoots = visibleRoots;
  workspace.skillDirs = ["scripts"];
  workspace.sharedPrefixes = [];
  writeFileSync(workspaceFile, `${JSON.stringify(workspace, null, 2)}\n`);

  const departmentsFile = resolve(sourceDir, "config/departments.json");
  const departments = JSON.parse(readFileSync(departmentsFile, "utf8"));
  departments.pathRules = [
    { prefix: "app/", dept: "work" },
    { prefix: "components/", dept: "content" },
    { prefix: "lib/", dept: "personal" },
    { prefix: "docs/", dept: "operations" },
    { prefix: "scripts/", dept: "operations" },
    { prefix: "lab/", dept: "operations" },
  ];
  writeFileSync(departmentsFile, `${JSON.stringify(departments, null, 2)}\n`);
}

const require = createRequire(import.meta.url);
const scanner = require(resolve(sourceDir, "scan.js"));
const result = scanner.runScan();
const fixture = {
  meta: {
    ...result.meta,
    scannedAt: "phase-1-reference-fixture",
    scanMs: 0,
  },
  departments: result.cfg.dep.departments,
  layers: result.cfg.dep.layers,
  nodes: result.graph.nodes,
  links: result.graph.links,
  mdLinks: result.mdLinks,
};

writeFileSync(resolve(outputFile), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  `Rubric fixture: ${fixture.nodes.length} nodes, ${fixture.links.length + fixture.mdLinks.length} links`
);
