export const DESCRIPTION_EDITOR_PLACEHOLDER =
  "Describe the space, what makes it useful, and what guests should know. You can use bullet points and bold important details.";

/** Strip markdown for card excerpts, map popups, and search snippets. */
export function stripMarkdownForExcerpt(
  text: string | null | undefined,
  maxLength = 160
): string {
  if (!text?.trim()) return "";

  const plain = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export function isSafeMarkdownLink(href: string | undefined): boolean {
  if (!href?.trim()) return false;
  try {
    const url = new URL(href, "https://example.com");
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

/** Remove basic markdown from a string slice (for clear-formatting in the editor). */
export function stripBasicMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
