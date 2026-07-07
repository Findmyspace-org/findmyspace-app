import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export type UnsubscribeTokenPayload = {
  marketingContactId: string;
  emailNormalised: string;
  exp: number;
};

function getUnsubscribeSecret(): string {
  const secret =
    process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("MARKETING_UNSUBSCRIBE_SECRET or INTERNAL_API_SECRET is required.");
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getUnsubscribeSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createUnsubscribeToken(input: {
  marketingContactId: string;
  emailNormalised: string;
  expiresAt?: number;
}): string {
  const payload: UnsubscribeTokenPayload = {
    marketingContactId: input.marketingContactId,
    emailNormalised: input.emailNormalised,
    exp: input.expiresAt ?? Date.now() + TOKEN_TTL_MS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyUnsubscribeToken(
  token: string
): { ok: true; payload: UnsubscribeTokenPayload } | { ok: false; error: string } {
  if (!token?.includes(".")) {
    return { ok: false, error: "Invalid unsubscribe link." };
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return { ok: false, error: "Invalid unsubscribe link." };
  }

  const expected = signPayload(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: "Invalid or altered unsubscribe link." };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as UnsubscribeTokenPayload;
    if (!payload.marketingContactId || !payload.emailNormalised || !payload.exp) {
      return { ok: false, error: "Invalid unsubscribe link." };
    }
    if (payload.exp < Date.now()) {
      return { ok: false, error: "This unsubscribe link has expired." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid unsubscribe link." };
  }
}
