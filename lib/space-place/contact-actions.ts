import { buildCrmMailtoLink } from "@/lib/space-place/crm-email";

export function telHref(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

export function whatsappHref(
  phone: string | null | undefined,
  whatsapp?: string | null
): string | null {
  const raw = (whatsapp || phone)?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

/** CRM mailto with capture BCC and [CRM:contactId] subject tag. */
export function crmContactMailHref(
  email: string | null | undefined,
  contactId: string | null | undefined,
  options?: { subject?: string }
): string | null {
  if (!email?.trim() || !contactId?.trim()) return null;
  return buildCrmMailtoLink({
    email,
    contactId,
    subject: options?.subject,
  });
}
