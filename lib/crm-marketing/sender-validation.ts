const DEFAULT_SENDER_DOMAIN =
  process.env.MARKETING_SENDER_DOMAIN?.trim() ||
  process.env.EMAIL_FROM?.split("@")[1]?.replace(/>$/, "").trim() ||
  "";

export function parseSenderEmailAddress(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  const addr = (match ? match[1] : trimmed).trim().toLowerCase();
  return addr.includes("@") ? addr : null;
}

export function isApprovedMarketingSenderEmail(email: string | null | undefined): boolean {
  const parsed = parseSenderEmailAddress(email);
  if (!parsed) return false;
  const domain = parsed.split("@")[1];
  if (!domain) return false;
  if (!DEFAULT_SENDER_DOMAIN) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed);
  }
  return domain === DEFAULT_SENDER_DOMAIN.toLowerCase();
}

export function resolveDefaultSenderEmail(): string | null {
  return parseSenderEmailAddress(process.env.EMAIL_FROM);
}

export function validateMarketingSenderEmail(
  email: string | null | undefined
): { ok: true; email: string } | { ok: false; error: string } {
  const parsed = parseSenderEmailAddress(email || resolveDefaultSenderEmail());
  if (!parsed) {
    return { ok: false, error: "Sender email is required." };
  }
  if (!isApprovedMarketingSenderEmail(parsed)) {
    const hint = DEFAULT_SENDER_DOMAIN
      ? `Use an address on the approved domain (@${DEFAULT_SENDER_DOMAIN}).`
      : "Configure EMAIL_FROM or MARKETING_SENDER_DOMAIN.";
    return { ok: false, error: `Sender email is not on an approved domain. ${hint}` };
  }
  return { ok: true, email: parsed };
}
