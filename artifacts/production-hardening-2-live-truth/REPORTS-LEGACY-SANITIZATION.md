# Reports legacy sanitization

The historical row is immutable. Sanitization is a renderer/view-model boundary only.

Detected inputs include DOCTYPE documents, HTML shell/error responses, style/font payloads, and source-fetch error pages. The normal reading and print surfaces show:

> Source fetch failed when this historical snapshot was generated. Raw source response is available in technical details.

The original payload remains in the row and can be copied from a collapsed technical-details control. It is not mounted as normal prose. Copy Markdown emits the safe explanation. New Report generation runs the same unsafe-prose assertion before persistence.

Proofs cover three legacy payload shapes, new-generation rejection, server-rendered non-disclosure, immutable JSON, exact Markdown, history, and print.
