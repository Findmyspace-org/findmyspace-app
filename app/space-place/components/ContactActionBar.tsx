"use client";

import { Check, Mail, MessageCircle, Phone } from "lucide-react";
import { mailHref, telHref, whatsappHref } from "@/lib/space-place/contact-actions";
import { SecondaryButton } from "./SpacePlaceShell";

type Props = {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  onDone?: () => void;
  showDone?: boolean;
};

export function ContactActionBar({
  phone,
  whatsapp,
  email,
  onDone,
  showDone,
}: Props) {
  const tel = telHref(phone);
  const wa = whatsappHref(phone, whatsapp);
  const mail = mailHref(email);

  return (
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
      {mail ? (
        <SecondaryButton href={mail}>
          <Mail className="h-4 w-4" /> Email
        </SecondaryButton>
      ) : null}
      {showDone && onDone ? (
        <SecondaryButton onClick={onDone}>
          <Check className="h-4 w-4" /> Done
        </SecondaryButton>
      ) : null}
    </div>
  );
}
