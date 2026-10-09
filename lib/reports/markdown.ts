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

/** Untrusted values interpolated into list items must not carry their own
 * Markdown line structure. Collapse source newlines without mutating the
 * frozen JSON, then escape every Markdown metacharacter. */
export function markdownInlineText(value: string): string {
  return escapeMarkdownText(value.replace(/\s+/g, " ").trim());
}

/** Every source line remains visibly quoted, including blank lines. */
export function markdownBlockquoteLines(value: string, indent = ""): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `${indent}> ${escapeMarkdownText(line)}`);
}

/** Convert this module's escaped report Markdown into actual clipboard text.
 * Protect source punctuation before removing presentation syntax: a quoted
 * literal **, [link](url), underscore or backtick must survive unchanged.
 * The result is text/plain only; never use it as HTML or executable Markdown. */
export function reportMarkdownToPlainText(markdown: string): string {
  let prefix = "\uE000signalPlain";
  while (markdown.includes(prefix)) prefix += "x";
  const literals: string[] = [];
  const protectedText = markdown.replace(/\\([\\`*_[\]{}()#+\-.!|])/g, (_match, character: string) => {
    literals.push(character);
    return `${prefix}${literals.length - 1}\uE001`;
  });
  const text = protectedText
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^_([^\n]+)_$/gm, "$1")
    .replace(/`/g, "")
    .replace(/&(amp|lt|gt);/g, (_match, entity: string) => ({ amp: "&", lt: "<", gt: ">" })[entity]!);
  return text.replace(new RegExp(`${prefix}(\\d+)\uE001`, "g"), (_match, index: string) => literals[Number(index)]);
}
