import crypto from "crypto";

/**
 * PHP `urlencode` semantics used by PayFast signatures.
 * `encodeURIComponent` leaves `!'()*~` unencoded; PHP urlencode encodes them.
 * Spaces become `+`; percent hex is uppercase.
 */
export function payfastUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/~/g, "%7E")
    .replace(/%20/g, "+");
}

/** Checkout attribute order from PayFast custom integration docs. */
export const PAYFAST_CHECKOUT_SIGNATURE_KEYS = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "name_last",
  "email_address",
  "m_payment_id",
  "amount",
  "item_name",
  "custom_str1",
  "custom_str2",
] as const;

export type PayFastSignatureOptions = {
  /** When true (checkout), blank values are omitted. ITN includes blanks. */
  skipEmpty?: boolean;
  trimValues?: boolean;
};

export function buildPayFastParamString(
  entries: Iterable<[string, string]>,
  options: PayFastSignatureOptions = {}
): string {
  const skipEmpty = options.skipEmpty ?? true;
  const trimValues = options.trimValues ?? true;
  const parts: string[] = [];

  for (const [key, raw] of entries) {
    if (key === "signature") continue;
    const value = trimValues ? String(raw).trim() : String(raw);
    if (skipEmpty && value === "") continue;
    parts.push(`${key}=${payfastUrlEncode(value)}`);
  }

  return parts.join("&");
}

export function appendPayFastPassphrase(
  paramString: string,
  passphrase?: string
): string {
  if (!passphrase || passphrase.trim() === "") return paramString;
  return `${paramString}&passphrase=${payfastUrlEncode(passphrase.trim())}`;
}

export function md5Hex(value: string): string {
  return crypto.createHash("md5").update(value).digest("hex");
}

export function generatePayFastSignature(
  data: Record<string, string>,
  passphrase?: string,
  orderedKeys: readonly string[] = PAYFAST_CHECKOUT_SIGNATURE_KEYS
): string {
  const entries = orderedKeys
    .filter((key) => data[key] !== undefined && data[key] !== null)
    .map((key) => [key, String(data[key])] as [string, string]);
  const paramString = buildPayFastParamString(entries, {
    skipEmpty: true,
    trimValues: true,
  });
  return md5Hex(appendPayFastPassphrase(paramString, passphrase));
}

/** ITN: posted order, include empty values, stop at `signature`, then passphrase. */
export function generatePayFastItnSignature(
  rawBody: string,
  passphrase?: string
): string {
  const params = new URLSearchParams(rawBody);
  const entries: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (key === "signature") break;
    entries.push([key, value]);
  }
  const paramString = buildPayFastParamString(entries, {
    skipEmpty: false,
    trimValues: false,
  });
  return md5Hex(appendPayFastPassphrase(paramString, passphrase));
}

/** Test helper: canonical string before MD5 (never log in production). */
export function buildPayFastCheckoutSignatureString(
  data: Record<string, string>,
  passphrase?: string
): string {
  const entries = PAYFAST_CHECKOUT_SIGNATURE_KEYS.filter(
    (key) => data[key] !== undefined && data[key] !== null
  ).map((key) => [key, String(data[key])] as [string, string]);
  return appendPayFastPassphrase(
    buildPayFastParamString(entries, { skipEmpty: true, trimValues: true }),
    passphrase
  );
}
