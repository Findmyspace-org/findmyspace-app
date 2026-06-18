"use client";

import { useCallback, useRef } from "react";
import {
  Bold,
  Eraser,
  List,
  ListOrdered,
} from "lucide-react";
import {
  DESCRIPTION_EDITOR_PLACEHOLDER,
  stripBasicMarkdown,
} from "@/lib/markdown-description";

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  textareaClassName?: string;
  id?: string;
};

function getLineBounds(text: string, position: number) {
  const start = text.lastIndexOf("\n", position - 1) + 1;
  const nextBreak = text.indexOf("\n", position);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return { start, end };
}

function getSelectionLineRange(text: string, start: number, end: number) {
  const rangeStart = text.lastIndexOf("\n", start - 1) + 1;
  const rangeEndIndex = text.indexOf("\n", end);
  const rangeEnd = rangeEndIndex === -1 ? text.length : rangeEndIndex;
  return { start: rangeStart, end: rangeEnd };
}

function applyTextUpdate(
  textarea: HTMLTextAreaElement,
  newValue: string,
  cursor: number,
  onChange: (value: string) => void
) {
  onChange(newValue);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

export default function MarkdownDescriptionEditor({
  value,
  onChange,
  rows = 5,
  placeholder = DESCRIPTION_EDITOR_PLACEHOLDER,
  disabled = false,
  textareaClassName = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]",
  id,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.slice(start, end) || "text";
      const newValue =
        value.slice(0, start) + before + selected + after + value.slice(end);
      const cursor = start + before.length + selected.length + after.length;
      applyTextUpdate(textarea, newValue, cursor, onChange);
    },
    [onChange, value]
  );

  const toggleLinePrefix = useCallback(
    (prefix: string | ((index: number) => string)) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const { start: rangeStart, end: rangeEnd } =
        start === end
          ? getLineBounds(value, start)
          : getSelectionLineRange(value, start, end);

      const block = value.slice(rangeStart, rangeEnd);
      const lines = block.split("\n");
      const prefixPattern = prefix === "- " ? /^[-*+]\s+/ : /^\d+\.\s+/;
      const allPrefixed = lines.every(
        (line) => line.trim() === "" || prefixPattern.test(line)
      );

      const nextLines = lines.map((line, index) => {
        if (line.trim() === "") return line;
        if (allPrefixed) return line.replace(prefixPattern, "");
        const nextPrefix =
          typeof prefix === "function" ? prefix(index) : prefix;
        return `${nextPrefix}${line}`;
      });

      const nextBlock = nextLines.join("\n");
      const newValue =
        value.slice(0, rangeStart) + nextBlock + value.slice(rangeEnd);
      const cursor = rangeStart + nextBlock.length;
      applyTextUpdate(textarea, newValue, cursor, onChange);
    },
    [onChange, value]
  );

  const clearFormatting = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const target =
      start === end ? value : value.slice(start, end);
    const cleaned = stripBasicMarkdown(target);

    if (start === end) {
      applyTextUpdate(textarea, cleaned, cleaned.length, onChange);
      return;
    }

    const newValue = value.slice(0, start) + cleaned + value.slice(end);
    const cursor = start + cleaned.length;
    applyTextUpdate(textarea, newValue, cursor, onChange);
  }, [onChange, value]);

  const toolbarButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d4dbe2] bg-white text-[#475569] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="overflow-hidden rounded-lg border border-[#d4dbe2] bg-white shadow-sm focus-within:border-[#c1121f] focus-within:ring-2 focus-within:ring-[#c1121f]/20">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#e2e8f0] bg-[#f8fafc] px-2 py-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => wrapSelection("**", "**")}
          className={toolbarButtonClass}
          title="Bold"
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => toggleLinePrefix("- ")}
          className={toolbarButtonClass}
          title="Bullet list"
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => toggleLinePrefix((index) => `${index + 1}. `)}
          className={toolbarButtonClass}
          title="Numbered list"
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={clearFormatting}
          className={toolbarButtonClass}
          title="Clear formatting"
          aria-label="Clear formatting"
        >
          <Eraser className="h-4 w-4" />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className={`${textareaClassName} resize-y border-0 shadow-none focus:border-transparent focus:ring-0`}
      />
    </div>
  );
}
