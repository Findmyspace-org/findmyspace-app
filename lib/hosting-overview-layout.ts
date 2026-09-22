import type { HostingOpsItem, HostingSummaryItem } from "@/app/components/hosting/hosting-ui";
import type { OrganisationOverviewCardModel } from "@/lib/hosting-overview-commercial";

export function hostingOverviewSummaryItems(input: {
  pendingRequestsCount: number;
  pendingQuestionsCount: number;
  monthlyIncomeLabel: string;
  activeListingsCount: number;
  pendingListingApprovalCount: number;
  showFinance: boolean;
  requestsHref: string;
  commsHref: string;
  financeHref: string;
  listingsHref: string;
}): HostingSummaryItem[] {
  const items: HostingSummaryItem[] = [
    {
      label: "Requests",
      value: input.pendingRequestsCount,
      href: input.requestsHref,
      attention: input.pendingRequestsCount > 0,
    },
    {
      label: "Questions",
      value: input.pendingQuestionsCount,
      href: input.commsHref,
      attention: input.pendingQuestionsCount > 0,
    },
  ];
  if (input.showFinance) {
    items.push({
      label: "Revenue",
      value: input.monthlyIncomeLabel,
      href: input.financeHref,
    });
  }
  items.push({
    label: "Active spaces",
    value: input.activeListingsCount,
    href: input.listingsHref,
    attention: input.pendingListingApprovalCount > 0,
    hint:
      input.pendingListingApprovalCount > 0
        ? `${input.pendingListingApprovalCount} awaiting approval`
        : undefined,
  });
  return items;
}

export function hostingOverviewOpsItems(input: {
  awaitingPaymentCount: number;
  confirmedBookingsCount: number;
  requestsHref: string;
  calendarHref: string;
  organisationCard: OrganisationOverviewCardModel | null;
  personalVerification:
    | { needsAttention: boolean; href: string }
    | null;
}): HostingOpsItem[] {
  const items: HostingOpsItem[] = [
    {
      label: "Awaiting payment",
      value: String(input.awaitingPaymentCount),
      href: input.requestsHref,
      tone: input.awaitingPaymentCount > 0 ? "attention" : "default",
    },
    {
      label: "Confirmed",
      value: String(input.confirmedBookingsCount),
      href: input.calendarHref,
    },
  ];

  if (input.organisationCard) {
    items.push({
      label: "Organisation",
      value: input.organisationCard.ready
        ? "Ready"
        : input.organisationCard.value,
      href: input.organisationCard.href,
      detail: input.organisationCard.ready
        ? input.organisationCard.ticks.join(" · ")
        : input.organisationCard.subtitle || undefined,
      tone: input.organisationCard.ready
        ? "ready"
        : input.organisationCard.highlight
          ? "attention"
          : "default",
    });
  } else if (input.personalVerification) {
    items.push({
      label: "Verification",
      value: input.personalVerification.needsAttention ? "Action" : "OK",
      href: input.personalVerification.href,
      detail: input.personalVerification.needsAttention
        ? "ID verification required"
        : "Profile verified",
      tone: input.personalVerification.needsAttention ? "attention" : "default",
    });
  }

  return items;
}
