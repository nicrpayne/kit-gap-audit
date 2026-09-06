export type LegacyPayloadKind = "report" | "html_error";

export interface LegacyReportPresentation {
  kind: LegacyPayloadKind;
  safeMarkdown: string;
  rawLength: number;
  reason: string | null;
}

const HTML_ERROR_MARKERS = [
  /<!doctype\s+html/i,
  /<html(?:\s|>)/i,
  /<head(?:\s|>)/i,
  /<style(?:\s|>)[\s\S]*?<\/style>/i,
  /<title[^>]*>[^<]*(?:error|unavailable|down|gateway|cloudflare)/i,
  /(?:linear|upstream|source)[^\n<]{0,80}(?:is down|unavailable|failed|error)/i,
  /data:(?:font|application)\/[a-z0-9.+-]+;base64,/i,
];

/** Presentation-only classification. The immutable row remains untouched. */
export function presentLegacyReport(raw: string): LegacyReportPresentation {
  const trimmed = raw.trimStart();
  const markers = HTML_ERROR_MARKERS.filter((marker) => marker.test(trimmed));
  const htmlEnvelope = /^<!doctype\s+html|^<html(?:\s|>)/i.test(trimmed);
  const clearlyErrorPayload = htmlEnvelope || markers.length >= 2;
  if (!clearlyErrorPayload) {
    return { kind: "report", safeMarkdown: raw, rawLength: raw.length, reason: null };
  }

  return {
    kind: "html_error",
    rawLength: raw.length,
    reason: "The stored report body is an upstream HTML/error response, not report prose.",
    safeMarkdown:
      "Source fetch failed when this historical snapshot was generated. Raw source response is available in technical details.",
  };
}

export function assertGeneratedReportProse(markdown: string): void {
  if (presentLegacyReport(markdown).kind !== "report") {
    throw new Error("Report generation refused an upstream HTML/error payload as report prose.");
  }
}
