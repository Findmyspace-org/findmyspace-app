export const CAMPAIGN_MERGE_FIELDS = [
  { key: "contact_first_name", label: "Contact first name", fallback: "there" },
  { key: "contact_full_name", label: "Contact full name", fallback: "there" },
  { key: "organisation_name", label: "Organisation name", fallback: "" },
  { key: "primary_contact_name", label: "Primary contact name", fallback: "" },
  { key: "campaign_subject", label: "Campaign subject", fallback: "" },
  { key: "unsubscribe_url", label: "Unsubscribe URL", fallback: "#" },
] as const;

export type CampaignMergeContext = {
  contactFirstName?: string | null;
  contactFullName?: string | null;
  organisationName?: string | null;
  primaryContactName?: string | null;
  campaignSubject?: string | null;
  unsubscribeUrl?: string | null;
};

export function applyMergeFields(
  template: string,
  context: CampaignMergeContext
): string {
  const map: Record<string, string> = {
    contact_first_name:
      context.contactFirstName?.trim() ||
      context.contactFullName?.split(/\s+/)[0] ||
      "there",
    contact_full_name: context.contactFullName?.trim() || "there",
    organisation_name: context.organisationName?.trim() || "",
    primary_contact_name: context.primaryContactName?.trim() || "",
    campaign_subject: context.campaignSubject?.trim() || "",
    unsubscribe_url: context.unsubscribeUrl || "#",
  };

  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const normalised = key.toLowerCase();
    return map[normalised] ?? "";
  });
}

export type CampaignContentJson = {
  heading?: string;
  introText?: string;
  mainContent?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  heroImageUrl?: string;
  secondarySections?: Array<{ title?: string; body?: string }>;
};

export function normaliseCampaignContent(raw: unknown): CampaignContentJson {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as CampaignContentJson;
  return {
    heading: value.heading?.trim() || "",
    introText: value.introText?.trim() || "",
    mainContent: value.mainContent?.trim() || "",
    ctaLabel: value.ctaLabel?.trim() || "",
    ctaUrl: value.ctaUrl?.trim() || "",
    heroImageUrl: value.heroImageUrl?.trim() || "",
    secondarySections: Array.isArray(value.secondarySections)
      ? value.secondarySections
      : [],
  };
}
