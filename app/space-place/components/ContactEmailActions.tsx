"use client";

import { useState } from "react";
import { Copy, Mail } from "lucide-react";
import { crmContactMailHref } from "@/lib/space-place/contact-actions";
import { SecondaryButton } from "./SpacePlaceShell";

type ContactEmailActionsProps = {
  email: string | null | undefined;
  contactId: string | null | undefined;
  className?: string;
  compact?: boolean;
};

export function ContactEmailActions({
  email,
  contactId,
  className = "",
  compact = false,
}: ContactEmailActionsProps) {
  const [copied, setCopied] = useState(false);
  const mailto = crmContactMailHref(email, contactId);

  if (!email?.trim()) return null;

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email!.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {mailto ? (
        <SecondaryButton
          href={mailto}
          className={compact ? "!min-h-[36px] !px-2.5 !py-1.5 !text-xs" : undefined}
        >
          <Mail className="h-4 w-4" /> Email
        </SecondaryButton>
      ) : null}
      <SecondaryButton
        onClick={() => void copyEmail()}
        className={compact ? "!min-h-[36px] !px-2.5 !py-1.5 !text-xs" : undefined}
      >
        <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy Email"}
      </SecondaryButton>
    </div>
  );
}
