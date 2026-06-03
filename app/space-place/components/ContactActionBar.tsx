"use client";

import { Check, MessageCircle, Phone } from "lucide-react";
import { telHref, whatsappHref } from "@/lib/space-place/contact-actions";
import { ContactEmailActions } from "./ContactEmailActions";
import { SecondaryButton } from "./SpacePlaceShell";

type Props = {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  contactId?: string | null;
  onDone?: () => void;
  showDone?: boolean;
};

export function ContactActionBar({
  phone,
  whatsapp,
  email,
  contactId,
  onDone,
  showDone,
}: Props) {
  const tel = telHref(phone);
  const wa = whatsappHref(phone, whatsapp);

  return (
    <div className="flex flex-col gap-2">
      {email?.trim() && contactId ? (
        <ContactEmailActions email={email} contactId={contactId} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {tel ? (
          <SecondaryButton href={tel}>
            <Phone className="h-4 w-4" /> Call
          </SecondaryButton>
        ) : null}
        {wa ? (
          <SecondaryButton href={wa}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </SecondaryButton>
        ) : null}
        {showDone && onDone ? (
          <SecondaryButton onClick={onDone}>
            <Check className="h-4 w-4" /> Done
          </SecondaryButton>
        ) : null}
      </div>
    </div>
  );
}
