# Report text export

`Copy Markdown` keeps safe Markdown presentation. `Copy plain text` removes
presentation syntax but preserves the original quote's punctuation, including
literal brackets, underscores, backticks, backslashes and HTML-like text. The
conversion never changes the saved report or its captured source records.

If the browser denies clipboard access, the copy control exposes a labelled,
read-only text box. Focus it to select the contents, then use the operating
system's normal copy command. An unsuccessful copy is not reported as success.

The shared converter is only for this application's escaped report Markdown.
Its result is plain text, not safe HTML or executable Markdown.

Verification: `npm run test:report-plain-text` checks literal source characters,
single entity decoding, both report renderers and frozen-data preservation.
The clipboard fallback source-binding check is not a browser-permission test;
actual browser clipboard behavior is tracked separately in acceptance evidence.
