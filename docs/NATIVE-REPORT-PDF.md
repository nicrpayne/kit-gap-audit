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

### Browser download recovery

The primary button prepares the PDF and asks the browser to save it. Signal
can confirm that the bytes were prepared, but cannot confirm that a browser
accepted the download or that a user saved a file. It therefore says **PDF
prepared**, not “download complete.” Authentication, non-PDF responses and
server errors remain visible inline, with retry available.

If nothing appears in Downloads, choose **Use browser download** beneath the
button. This is a normal user-activated link to the same protected PDF endpoint,
with the server's attachment filename. It does not use a hidden blob link,
change browser permissions, expose a public report URL or bypass sign-in.
It may open separately; the working report stays open. Reader access is checked
again on every request, including after revocation. Browser download permissions
still apply to both paths.

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

`npm run proof:report-download-browser -- <output-directory>` runs the actual
built-app PDF endpoints in Chromium and WebKit: button download, native keyboard
download, authentication/MIME failure and retry, approved reader, revoked stale
reader UI and unchanged saved report/Scope. It requires `SIGNAL_REPAIR_DB_PROOF=1`
and the guarded disposable PostgreSQL URL described in
`scripts/lib/disposable-db-proof-guard.ts`. Start with an empty project/report
database, run migrations and `npm run build` first. The script owns port 4398,
cleans its fictional report and stops its server. Its mail preload refuses
external providers and captures only fake mail locally. Never point this proof
at staging or production. Reader sign-in is established through HTTP with a
mock code; this is not a real mailbox or deployed HTTPS acceptance test.
