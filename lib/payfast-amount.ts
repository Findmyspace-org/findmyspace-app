/** PayFast’s documented one-off payment floor (ZAR). Do not invent a different threshold. */
export const PAYFAST_MIN_AMOUNT_ZAR = 5;

export const PAYFAST_BELOW_MINIMUM_MESSAGE =
  "This payment amount is below the minimum amount supported for online payment.";

export const PAYFAST_INVALID_AMOUNT_MESSAGE = "Invalid booking amount.";

export function roundPayFastAmount(amount: unknown): number | null {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Authoritative PayFast payable-amount rule.
 * Zero/negative stay invalid (not sent to PayFast). Positive amounts below
 * the documented minimum are rejected without silently increasing them.
 */
export function validatePayFastPayableAmount(
  amount: unknown
): { ok: true; amount: number } | { ok: false; error: string } {
  const rounded = roundPayFastAmount(amount);
  if (rounded === null || rounded <= 0) {
    return { ok: false, error: PAYFAST_INVALID_AMOUNT_MESSAGE };
  }
  if (rounded < PAYFAST_MIN_AMOUNT_ZAR) {
    return { ok: false, error: PAYFAST_BELOW_MINIMUM_MESSAGE };
  }
  return { ok: true, amount: rounded };
}

export function amountsMatchForPayFast(
  expectedTotal: unknown,
  amountGross: number
): boolean {
  const expected = roundPayFastAmount(expectedTotal);
  const actual = roundPayFastAmount(amountGross);
  if (expected === null || actual === null) return false;
  return Math.abs(expected - actual) < 0.005;
}
