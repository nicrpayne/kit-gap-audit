/**
 * Render untrusted snapshot prose as inert Markdown text. The source value is
 * left untouched in the report JSON; escaping happens only at presentation.
 */
export function escapeMarkdownText(value: string): string {
  const entities = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return entities.replace(/([\\`*_[\]{}()#+\-.!|])/g, "\\$1");
}

/** Every source line remains visibly quoted, including blank lines. */
export function markdownBlockquoteLines(value: string, indent = ""): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `${indent}> ${escapeMarkdownText(line)}`);
}
