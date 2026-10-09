# Direct PDF download

Reports and the private-sharing preview now offer **Download PDF**. The download
is generated on Signal's server from the exact saved reader projection, without
browser printing, an external rendering service, live project queries or a
second forecast run. A saved Reality/Scenario pair stays paired. The same
captured values, dates, estimate-use distinctions, source quotes and locators
appear in the executive preview and PDF. Long quotes paginate rather than clip.

The export includes a dated timeline snapshot with span bars and landmarks;
these are accepted plans, not a newly inferred resource schedule. It includes
all supporting sections, not just the collapsed content visible on screen.

Owner downloads require operator authentication, even in an otherwise
unconfigured development instance. Recipient downloads require an active,
unexpired reader session and approved grant, checked before and after rendering.
Downloads have private/no-store headers. A copied file cannot be revoked, so the
reader UI and PDF explicitly warn recipients to keep downloaded copies private.
Revocation prevents new downloads; it cannot erase files already downloaded.

Missing reader configuration fails closed. Unsupported legacy snapshots, absent
comparison halves, unsupported font characters and oversized reports show an
error rather than exporting silently corrupted evidence. The saved HTML print
view remains available as a fallback. Limits: 2 MB of projected snapshot input,
at most two snapshots, 200 pages. The bundled DejaVu Sans fonts cover many scripts
but not all. No PDF/A or fully tagged-accessibility certification is claimed;
the HTML reader is the primary keyboard/screen-reader view.

PDFKit/fontkit and DejaVu fonts are pinned dependencies. Fonts are fixed packaged
assets, traced into the server build, with their license included in PDF metadata
and the dependency distribution. No input controls an asset path. Snapshot text
is inert PDF text: no external links, script, forms or embedded attachments.

Checks: `npm run proof:report-pdf` creates clearly fictional pair and long-quote
fixtures and tests size/font error behavior. `npm run proof:report-sharing-http`
also checks the actual owner and reader PDF endpoints in an isolated database
with mock email only, including anonymous/other-report/removed-recipient denial.
The acceptance workflow separately extracts PDF text, checks page bounds and
renders every page for visual inspection. A successful build is not PDF QA.
