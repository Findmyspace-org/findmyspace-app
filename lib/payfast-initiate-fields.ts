import crypto from "crypto";

/**
 * PayFast Onsite / redirect field ordering and signature (MD5) — shared with initiate route.
 */
export function generatePayFastSignature(
  data: Record<string, string>,
  passphrase?: string
) {
  const orderedKeys = [
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
  ];

  const paramString = orderedKeys
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map((key) => {
      const value = String(data[key]).trim();
      return `${key}=${encodeURIComponent(value).replace(/%20/g, "+")}`;
    })
    .join("&");

  const finalString =
    passphrase && passphrase.trim() !== ""
      ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
      : paramString;

  return crypto.createHash("md5").update(finalString).digest("hex");
}

export type PayFastInitiatePaymentDataInput = {
  appBaseUrl: string;
  booking: { id: string; space_id: string; total_price: number };
  spaceTitle: string | null;
  payerFirstName: string;
  payerLastName: string;
  payerEmail: string;
  merchantId: string;
  merchantKey: string;
};

/**
 * Builds the same `paymentData` record as the PayFast initiate route (before signature).
 */
export function buildPayFastInitiatePaymentData(
  input: PayFastInitiatePaymentDataInput
): Record<string, string> {
  const { appBaseUrl, booking, spaceTitle, payerFirstName, payerLastName, payerEmail, merchantId, merchantKey } =
    input;
  const amount = Number(booking.total_price).toFixed(2);
  return {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${appBaseUrl}/dashboard/my-bookings?payment=success&bookingId=${booking.id}`,
    cancel_url: `${appBaseUrl}/dashboard/my-bookings?payment=cancelled&bookingId=${booking.id}`,
    notify_url: `${appBaseUrl}/api/payfast/notify`,
    name_first: payerFirstName,
    name_last: payerLastName,
    email_address: payerEmail,
    m_payment_id: String(booking.id),
    amount,
    item_name: spaceTitle
      ? `FindMySpace - ${spaceTitle}`
      : `FindMySpace booking ${booking.id}`,
    custom_str1: String(booking.id),
    custom_str2: String(booking.space_id),
  };
}
