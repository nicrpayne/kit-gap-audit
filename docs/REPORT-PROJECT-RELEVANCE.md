# Project relevance in report caveats

The October 8 repair removes a prototype-era global lookup for a project named KIT Construct. Its absence did not establish a missing dependency or pivot for the report being generated. The old check incorrectly added that warning to unrelated projects, including fictional QA reports.

New ordinary report generation uses the selected project's canonical dependencies and owner inputs. It does not infer a KIT Construct pivot from a workspace-wide name search. The assembler can represent an explicitly required, unavailable project through `requiredProjectContexts`; the pivot prototype supplies that requirement explicitly. The live report loader does not invent such a requirement. This is not a new pivot-planning UI or automatic dependency inference feature.

Existing saved reports remain immutable, including their historical caveats. A new report is required to capture corrected current owner inputs. No accepted Scope, Decision, staffing record, or saved forecast is changed by this repair.

Checks cover unrelated projects, an explicitly required missing project, an available required project, generic project names, and preservation of historical saved caveats. The original prototype artifacts under `artifacts/` describe their historical build, not the current generation rule.
