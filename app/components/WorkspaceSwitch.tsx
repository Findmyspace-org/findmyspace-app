"use client";

import { GuardedLink } from "@/app/components/UnsavedChangesProvider";

export default function WorkspaceSwitch({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <GuardedLink
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-gray-500 underline-offset-2 hover:text-[#0c1d2f] hover:underline sm:text-xs"
    >
      {label}
      <span aria-hidden>→</span>
    </GuardedLink>
  );
}
