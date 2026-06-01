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

export function mailHref(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return `mailto:${email.trim()}`;
}
