"use client";

/**
 * Small client-side button that opens the floating SpaceAssistant by
 * dispatching a window-level CustomEvent. Used in places (e.g. the listing
 * detail server component) where we can't attach `onClick` directly.
 */
export default function AskAboutSpaceButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("findmyspace:open-assistant"));
      }}
      className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-[#192a3a] transition hover:bg-gray-50"
    >
      Ask about this space
    </button>
  );
}
