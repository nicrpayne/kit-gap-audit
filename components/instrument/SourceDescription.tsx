import Markdown from "react-markdown";

/** Presentation only: retain the source string, paragraph boundaries and soft
 * line breaks. Never execute source HTML or fetch embedded remote images. */
export default function SourceDescription({ text, possibleLegacyExcerpt = false }: {
  text: string;
  possibleLegacyExcerpt?: boolean;
}) {
  return <div className="min-w-0 text-[13px] leading-relaxed text-[var(--i-text-soft)] [overflow-wrap:anywhere]" data-shoot="source-description">
    <div className="space-y-3 [&_p]:whitespace-pre-line [&_li]:whitespace-pre-line [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-1.5 [&_li>p]:my-1 [&_li>ul]:mt-1 [&_li>ol]:mt-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--i-border-strong)] [&_blockquote]:pl-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--i-recess)] [&_pre]:p-3 [&_code]:text-[12px] [&_strong]:font-semibold [&_strong]:text-[var(--i-text)]">
      <Markdown components={{
        h1: ({ children }) => <h3 className="pt-2 text-[14px] font-semibold text-[var(--i-text)] first:pt-0">{children}</h3>,
        h2: ({ children }) => <h3 className="pt-2 text-[14px] font-semibold text-[var(--i-text)] first:pt-0">{children}</h3>,
        h3: ({ children }) => <h3 className="pt-2 text-[14px] font-semibold text-[var(--i-text)] first:pt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="pt-1 font-semibold text-[var(--i-text)]">{children}</h4>,
        h5: ({ children }) => <h4 className="pt-1 font-semibold text-[var(--i-text)]">{children}</h4>,
        h6: ({ children }) => <h4 className="pt-1 font-semibold text-[var(--i-text)]">{children}</h4>,
        a: ({ href, children }) => href && /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(href)
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--i-signal)] underline underline-offset-2">{children}</a>
          : <span>{children}</span>,
        img: ({ alt }) => <span className="italic">[Image{alt ? `: ${alt}` : ""}]</span>,
      }}>{text}</Markdown>
    </div>
    {possibleLegacyExcerpt && <p className="mt-3 border-t border-[var(--i-border)] pt-3 text-[11px] text-[var(--i-amber)]" data-shoot="source-description-excerpt">
      This saved description may be a shortened import. Check the original source for the complete text.
    </p>}
  </div>;
}
