"use client";

import { useState } from "react";
import { Copy, Mail, Phone } from "lucide-react";
import { crmContactMailHref } from "@/lib/space-place/contact-actions";

type ActionButtonProps = {
  children: React.ReactNode;
  href?: string;
  onClick?: (event: React.MouseEvent) => void;
  label: string;
};

function CompactActionButton({
  children,
  href,
  onClick,
  label,
}: ActionButtonProps) {
  const className =
    "inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-[#c1121f]/30 hover:text-[#c1121f]";
  if (href) {
    return (
      <a
        href={href}
        className={className}
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      className={className}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function CrmContactEmailActions({
  email,
  contactId,
  className = "",
}: {
  email: string;
  contactId: string;
  className?: string;
}) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const mailto = crmContactMailHref(email, contactId);
  const trimmedEmail = email.trim();

  async function copyEmail() {
    if (!trimmedEmail) return;
    try {
      await navigator.clipboard.writeText(trimmedEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      setCopiedEmail(false);
    }
  }

  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {mailto ? (
        <CompactActionButton href={mailto} label="Email contact">
          <Mail className="h-3.5 w-3.5" /> Email
        </CompactActionButton>
      ) : null}
      <CompactActionButton onClick={() => void copyEmail()} label="Copy email address">
        <Copy className="h-3.5 w-3.5" /> {copiedEmail ? "Copied" : "Copy email"}
      </CompactActionButton>
    </div>
  );
}

export function CrmContactPhoneActions({
  phone,
  className = "",
}: {
  phone: string;
  className?: string;
}) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const trimmedPhone = phone.trim();

  async function copyPhone() {
    if (!trimmedPhone) return;
    try {
      await navigator.clipboard.writeText(trimmedPhone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } catch {
      setCopiedPhone(false);
    }
  }

  return (
    <div className={`flex shrink-0 items-center ${className}`.trim()}>
      <CompactActionButton onClick={() => void copyPhone()} label="Copy phone number">
        <Phone className="h-3.5 w-3.5" /> {copiedPhone ? "Copied" : "Copy phone"}
      </CompactActionButton>
    </div>
  );
}

type Props = {
  email?: string | null;
  phone?: string | null;
  contactId: string;
  className?: string;
};

/** @deprecated Prefer CrmContactEmailActions / CrmContactPhoneActions inline per row. */
export function CrmContactQuickActions({
  email,
  phone,
  contactId,
  className = "",
}: Props) {
  const trimmedEmail = email?.trim() || "";
  const trimmedPhone = phone?.trim() || "";

  if (!trimmedEmail && !trimmedPhone) return null;

  return (
    <div className={`flex flex-wrap items-center justify-end gap-1.5 ${className}`.trim()}>
      {trimmedEmail ? (
        <CrmContactEmailActions email={trimmedEmail} contactId={contactId} />
      ) : null}
      {trimmedPhone ? <CrmContactPhoneActions phone={trimmedPhone} /> : null}
    </div>
  );
}
