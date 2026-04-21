import { isAwaitingGatewayPayment } from "@/lib/finance-status";
import {
  buildPayFastInitiatePaymentData,
  generatePayFastSignature,
} from "@/lib/payfast-initiate-fields";

export type BookingRowForPayFastInitiate = {
  id: string;
  renter_id: string;
  owner_id: string;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
  space_id: string;
};

/** Same eligibility checks as `app/api/payfast/initiate/route.ts` (renter flow). */
export function validateBookingForPayFastInitiate(
  booking: BookingRowForPayFastInitiate
): { ok: true } | { ok: false; error: string; status: number } {
  if (booking.status === "expired") {
    return {
      ok: false,
      error:
        "This booking expired because payment was not completed in time. Please send a new booking request.",
      status: 400,
    };
  }
  if (!isAwaitingGatewayPayment(booking)) {
    return {
      ok: false,
      error: "This booking is not ready for payment.",
      status: 400,
    };
  }
  if (!booking.total_price || booking.total_price <= 0) {
    return {
      ok: false,
      error: "Invalid booking amount.",
      status: 400,
    };
  }
  return { ok: true };
}

export type PayFastMerchantSecrets = {
  merchantId: string;
  merchantKey: string;
  passphrase: string | undefined;
  processUrl: string;
};

/** Profile row from `public.profiles` — used for PayFast payer identity (renter). */
export type PayFastPayerProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

/**
 * Maps profiles.first_name / last_name / full_name to PayFast name_first / name_last.
 * Does not use the authenticated user; pass the renter (or other payer) profile row only.
 */
export function resolvePayFastPayerNamesFromProfile(
  rp: PayFastPayerProfileRow
): { payerFirstName: string; payerLastName: string } {
  const joined = `${rp.first_name || ""} ${rp.last_name || ""}`.trim();
  const full = (rp.full_name || "").trim();
  const payerFirstName = joined
    ? String(rp.first_name || full.split(/\s+/)[0] || "FindMySpace")
    : String(full.split(/\s+/)[0] || "FindMySpace");
  const payerLastName = joined
    ? String(rp.last_name || full.split(/\s+/).slice(1).join(" ") || "User")
    : String(full.split(/\s+/).slice(1).join(" ") || "User");
  return { payerFirstName, payerLastName };
}

export function readPayFastMerchantSecrets(): PayFastMerchantSecrets | null {
  const {
    PAYFAST_MERCHANT_ID,
    PAYFAST_MERCHANT_KEY,
    PAYFAST_PASSPHRASE,
    PAYFAST_PROCESS_URL,
  } = process.env;
  const merchantId = PAYFAST_MERCHANT_ID?.trim();
  const merchantKey = PAYFAST_MERCHANT_KEY?.trim();
  const passphrase = PAYFAST_PASSPHRASE?.trim();
  const processUrlRaw = PAYFAST_PROCESS_URL?.trim();

  if (
    !merchantId ||
    !merchantKey ||
    !processUrlRaw
  ) {
    return null;
  }

  let processUrl: string;
  try {
    const parsed = new URL(processUrlRaw);
    processUrl = parsed.toString().replace(/\/+$/, "");

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    const isSandboxHost = host === "sandbox.payfast.co.za";
    const isLiveHost = host === "www.payfast.co.za" || host === "payfast.co.za";
    const isProcessPath = pathname === "/eng/process";

    if (!isProcessPath || (!isSandboxHost && !isLiveHost)) {
      return null;
    }

  } catch {
    return null;
  }

  return {
    merchantId,
    merchantKey,
    passphrase: passphrase || undefined,
    processUrl,
  };
}

/**
 * Builds the same JSON body as PayFast initiate success: `processUrl` + signed `fields`.
 */
export function buildSignedPayFastCheckoutPayload(params: {
  appBaseUrl: string;
  booking: { id: string; space_id: string; total_price: number };
  spaceTitle: string | null;
  payerFirstName: string;
  payerLastName: string;
  payerEmail: string;
  merchant: PayFastMerchantSecrets;
}): { processUrl: string; fields: Record<string, string> } {
  const paymentData = buildPayFastInitiatePaymentData({
    appBaseUrl: params.appBaseUrl,
    booking: params.booking,
    spaceTitle: params.spaceTitle,
    payerFirstName: params.payerFirstName,
    payerLastName: params.payerLastName,
    payerEmail: params.payerEmail,
    merchantId: params.merchant.merchantId,
    merchantKey: params.merchant.merchantKey,
  });
  const signature = generatePayFastSignature(
    paymentData,
    params.merchant.passphrase
  );
  return {
    processUrl: params.merchant.processUrl,
    fields: {
      ...paymentData,
      signature,
    },
  };
}
