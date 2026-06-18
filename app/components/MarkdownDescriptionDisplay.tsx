import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { isSafeMarkdownLink } from "@/lib/markdown-description";

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-3 text-base leading-relaxed text-gray-700 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[#192a3a]">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-base leading-relaxed text-gray-700">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-base leading-relaxed text-gray-700">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ href, children }) => {
    if (!isSafeMarkdownLink(href)) {
      return <span>{children}</span>;
    }
    return (
      <a
        href={href}
        rel="noopener noreferrer"
        target="_blank"
        className="font-medium text-[#c1121f] underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
};

type Props = {
  content: string | null | undefined;
  className?: string;
  emptyMessage?: string;
};

export default function MarkdownDescriptionDisplay({
  content,
  className = "",
  emptyMessage = "No description added yet.",
}: Props) {
  if (!content?.trim()) {
    return (
      <p className="text-base leading-relaxed text-gray-700">{emptyMessage}</p>
    );
  }

  return (
    <div className={`markdown-description max-w-none ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={markdownComponents}
        disallowedElements={[
          "script",
          "style",
          "iframe",
          "object",
          "embed",
          "form",
          "input",
        ]}
        unwrapDisallowed
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
