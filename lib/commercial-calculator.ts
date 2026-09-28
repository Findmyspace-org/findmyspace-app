/**
 * Authoritative FindMySpace commercial arithmetic.
 * Fees are deducted from host proceeds; renter gross is unchanged.
 */

export type CommercialModel = "commission" | "subscription" | "free";

export type CommercialAccountingMode = "split" | "legacy_combined";

export type CommercialCalculatorTerms = {
  model: CommercialModel;
  commissionPercent: number;
  transactionFeePercent: number;
  accountingMode: CommercialAccountingMode;
};

export type CommercialSplit = {
  grossAmount: number;
  transactionFee: number | null;
  platformCommission: number | null;
  totalFindmyspaceFee: number;
  hostEarnings: number;
  accountingMode: CommercialAccountingMode;
};

export const DEFAULT_COMMISSION_PERCENT = 10;
export const DEFAULT_TRANSACTION_FEE_PERCENT = 5;
export const LEGACY_COMBINED_PERCENT = 15;

export function roundMoney(value: number): number {
  return Number(Number(value).toFixed(2));
}

export function commissionRateForModel(
  model: CommercialModel,
  commissionPercent: number
): number {
  if (model !== "commission") return 0;
  return Number(commissionPercent) || 0;
}

export function calculateBookingCommercials(
  amount: number,
  terms: CommercialCalculatorTerms
): CommercialSplit {
  const grossAmount = roundMoney(amount);

  if (terms.accountingMode === "legacy_combined") {
    const totalFindmyspaceFee = roundMoney(
      grossAmount * ((Number(terms.commissionPercent) || 0) / 100)
    );
    return {
      grossAmount,
      transactionFee: null,
      platformCommission: null,
      totalFindmyspaceFee,
      hostEarnings: roundMoney(grossAmount - totalFindmyspaceFee),
      accountingMode: "legacy_combined",
    };
  }

  const transactionFee = roundMoney(
    grossAmount * ((Number(terms.transactionFeePercent) || 0) / 100)
  );
  const platformCommission = roundMoney(
    grossAmount * (commissionRateForModel(terms.model, terms.commissionPercent) / 100)
  );
  const totalFindmyspaceFee = roundMoney(transactionFee + platformCommission);

  return {
    grossAmount,
    transactionFee,
    platformCommission,
    totalFindmyspaceFee,
    hostEarnings: roundMoney(grossAmount - totalFindmyspaceFee),
    accountingMode: "split",
  };
}

/** Same split applied independently to each online payment amount. */
export function calculatePaymentCommercials(
  amount: number,
  terms: CommercialCalculatorTerms
): CommercialSplit {
  return calculateBookingCommercials(amount, terms);
}
