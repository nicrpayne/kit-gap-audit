import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportPdfDownload from "../../components/reports/ReportPdfDownload";

test("Both report readers expose a native download through their original protected endpoint", () => {
  for (const url of ["/api/reports/fictional/pdf?pair=1", "/api/report-access/fictional/pdf"]) {
    const html = renderToStaticMarkup(React.createElement(ReportPdfDownload, { url }));
    assert(html.includes(`href="${url}"`));
    assert.match(html, /download="" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /Use browser download/);
    assert.doesNotMatch(html, /blob:|PDF prepared|Downloaded successfully/);
  }
});
