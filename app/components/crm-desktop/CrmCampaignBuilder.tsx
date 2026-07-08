"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CAMPAIGN_AUDIENCE_WARNING,
  MARKETING_COMPLIANCE_NOTICE,
} from "@/lib/crm-marketing/constants";
import { CAMPAIGN_MERGE_FIELDS } from "@/lib/crm-marketing/campaign-content";
import type { CampaignAudienceDefinition } from "@/lib/crm-marketing/audience-definition";
import {
  fetchMarketingLists,
  fetchMarketingTemplates,
  previewMarketingRecipients,
  saveMarketingCampaignDraft,
  sendMarketingCampaignTestEmail,
  updateMarketingCampaign,
} from "@/lib/crm-marketing/api-client";
import { fetchCrmDesktopContacts } from "@/lib/crm-desktop/api-client";
import type {
  CrmMarketingCampaignRow,
  CrmMarketingTemplateRow,
  RecipientPreviewResult,
} from "@/lib/crm-marketing/types";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/space-place/constants";
import { ORGANISATION_TYPES } from "@/lib/space-place/organisation-types";
import { MARKETPLACE_AUDIENCE_FILTER_LABELS } from "@/lib/crm-marketing/audience-definition";

const STEPS = [
  "Campaign details",
  "Choose template",
  "Write content",
  "Select audience",
  "Review recipients",
  "Preview",
  "Save draft",
] as const;

type Props = {
  initialCampaign?: CrmMarketingCampaignRow | null;
};

export function CrmCampaignBuilder({ initialCampaign }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialCampaign?.name || "");
  const [subject, setSubject] = useState(initialCampaign?.subject || "");
  const [previewText, setPreviewText] = useState(initialCampaign?.previewText || "");
  const [senderName, setSenderName] = useState(initialCampaign?.senderName || "FindMySpace");
  const [senderEmail, setSenderEmail] = useState(initialCampaign?.senderEmail || "");
  const [replyTo, setReplyTo] = useState(initialCampaign?.replyTo || "");
  const [internalNotes, setInternalNotes] = useState(initialCampaign?.internalNotes || "");
  const [campaignType, setCampaignType] = useState(initialCampaign?.campaignType || "newsletter");
  const [templateId, setTemplateId] = useState<string | null>(initialCampaign?.templateId || null);
  const [templates, setTemplates] = useState<CrmMarketingTemplateRow[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [heading, setHeading] = useState("");
  const [introText, setIntroText] = useState("");
  const [mainContent, setMainContent] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [audience, setAudience] = useState<CampaignAudienceDefinition>({
    mode: "filtered",
    listIds: initialCampaign?.listIds || [],
    pipelineStages: [],
    organisationTypes: [],
    marketplaceFilters: [],
    manualIncludeContactIds: [],
    manualExcludeContactIds: [],
  });
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<
    Array<{ crm_contact_id: string; contact_name: string; organisation_name: string | null; email: string | null }>
  >([]);
  const [preview, setPreview] = useState<RecipientPreviewResult | null>(
    (initialCampaign?.audienceSnapshotJson as RecipientPreviewResult | null) ?? null
  );
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaign?.id || null);
  const [renderedHtml, setRenderedHtml] = useState(initialCampaign?.renderedHtml || "");
  const [testEmails, setTestEmails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const content = initialCampaign?.contentJson as Record<string, string> | undefined;
    if (content) {
      setHeading(content.heading || "");
      setIntroText(content.introText || "");
      setMainContent(content.mainContent || "");
      setCtaLabel(content.ctaLabel || "");
      setCtaUrl(content.ctaUrl || "");
      setHeroImageUrl(content.heroImageUrl || "");
    }
    const def = initialCampaign?.audienceDefinition as CampaignAudienceDefinition | undefined;
    if (def) setAudience(def);
  }, [initialCampaign]);

  useEffect(() => {
    void Promise.all([fetchMarketingTemplates(), fetchMarketingLists()]).then(
      ([templateRows, listRows]) => {
        setTemplates(templateRows.filter((t) => t.isActive));
        setLists(listRows.map((l) => ({ id: l.id, name: l.name })));
        if (!templateId) {
          const defaultTemplate = templateRows.find((t) => t.isDefault && t.isActive);
          if (defaultTemplate) setTemplateId(defaultTemplate.id);
        }
      }
    );
  }, [templateId]);

  const contentJson = useMemo(
    () => ({ heading, introText, mainContent, ctaLabel, ctaUrl, heroImageUrl }),
    [heading, introText, mainContent, ctaLabel, ctaUrl, heroImageUrl]
  );

  const selectedTemplate = templates.find((t) => t.id === templateId) || null;

  async function runPreview() {
    setError(null);
    const result = await previewMarketingRecipients({ audienceDefinition: audience });
    setPreview(result);
    setStep(4);
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        subject,
        previewText,
        senderName,
        senderEmail,
        replyTo,
        internalNotes,
        campaignType,
        templateId,
        contentJson,
        audienceDefinition: audience,
        listIds: audience.listIds,
      };
      const result = campaignId
        ? await updateMarketingCampaign(campaignId, payload)
        : await saveMarketingCampaignDraft(payload);
      const saved = result.campaign as CrmMarketingCampaignRow;
      setCampaignId(saved.id);
      setRenderedHtml(saved.renderedHtml || "");
      setPreview(result.preview as RecipientPreviewResult);
      setMessage("Draft saved.");
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function runTestSend() {
    if (!campaignId) {
      setError("Save the draft before sending a test email.");
      return;
    }
    try {
      await sendMarketingCampaignTestEmail(
        campaignId,
        testEmails.split(/[,\s;]+/).filter(Boolean)
      );
      setMessage("Test email sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed.");
    }
  }

  async function searchContacts() {
    const result = await fetchCrmDesktopContacts({ q: contactSearch, pageSize: 20 });
    setContactResults(
      result.rows.map((row) => ({
        crm_contact_id: row.id,
        contact_name: row.full_name,
        organisation_name: row.organisation_name,
        email: row.email,
      }))
    );
  }

  function toggleArrayValue<T extends string>(values: T[] | undefined, value: T): T[] {
    const set = new Set(values || []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return [...set];
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {MARKETING_COMPLIANCE_NOTICE}
      </p>
      <p className="text-sm font-medium text-amber-900">{CAMPAIGN_AUDIENCE_WARNING}</p>

      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-full px-3 py-1 ${
                step === index ? "bg-[#192a3a] text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {step === 0 ? (
        <section className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name *" className="rounded-lg border p-2 text-sm" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject *" className="rounded-lg border p-2 text-sm" />
          <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Preview text" className="rounded-lg border p-2 text-sm sm:col-span-2" />
          <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender name" className="rounded-lg border p-2 text-sm" />
          <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="Sender email (approved domain)" className="rounded-lg border p-2 text-sm" />
          <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Reply-to" className="rounded-lg border p-2 text-sm" />
          <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="rounded-lg border p-2 text-sm">
            <option value="newsletter">Newsletter</option>
            <option value="announcement">Announcement</option>
            <option value="onboarding">Onboarding</option>
            <option value="reengagement">Re-engagement</option>
          </select>
          <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal notes" className="rounded-lg border p-2 text-sm sm:col-span-2" rows={3} />
        </section>
      ) : null}

      {step === 1 ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setTemplateId(template.id)}
              className={`rounded-lg border p-4 text-left ${
                templateId === template.id ? "border-[#c1121f] bg-[#c1121f]/5" : "border-gray-200"
              }`}
            >
              <p className="font-semibold">{template.name}</p>
              <p className="mt-1 text-sm text-gray-600">{template.description}</p>
              {template.isDefault ? <p className="mt-2 text-xs text-[#c1121f]">Default</p> : null}
            </button>
          ))}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            {CAMPAIGN_MERGE_FIELDS.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => setMainContent((v) => `${v}{{${field.key}}}`)}
                className="rounded border px-2 py-1"
              >
                {field.label}
              </button>
            ))}
          </div>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="Heading" className="w-full rounded-lg border p-2 text-sm" />
          <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} placeholder="Intro text" className="w-full rounded-lg border p-2 text-sm" rows={3} />
          <textarea value={mainContent} onChange={(e) => setMainContent(e.target.value)} placeholder="Main content" className="w-full rounded-lg border p-2 text-sm" rows={8} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="CTA button text" className="rounded-lg border p-2 text-sm" />
            <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="CTA URL" className="rounded-lg border p-2 text-sm" />
          </div>
          <input value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="Hero image URL (optional)" className="w-full rounded-lg border p-2 text-sm" />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={audience.mode === "all_crm_contacts"}
              onChange={(e) =>
                setAudience((a) => ({
                  ...a,
                  mode: e.target.checked ? "all_crm_contacts" : "filtered",
                }))
              }
            />
            All CRM contacts
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">Lists</legend>
            <div className="mt-2 space-y-1">
              {lists.map((list) => (
                <label key={list.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={audience.listIds?.includes(list.id)}
                    onChange={() =>
                      setAudience((a) => ({ ...a, listIds: toggleArrayValue(a.listIds, list.id) }))
                    }
                  />
                  {list.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Pipeline stages</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PIPELINE_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() =>
                    setAudience((a) => ({
                      ...a,
                      pipelineStages: toggleArrayValue(a.pipelineStages, stage),
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs ${
                    audience.pipelineStages?.includes(stage)
                      ? "bg-[#c1121f] text-white"
                      : "bg-gray-100"
                  }`}
                >
                  {PIPELINE_STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Organisation types</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ORGANISATION_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() =>
                    setAudience((a) => ({
                      ...a,
                      organisationTypes: toggleArrayValue(a.organisationTypes, type.value),
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs ${
                    audience.organisationTypes?.includes(type.value)
                      ? "bg-[#192a3a] text-white"
                      : "bg-gray-100"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Marketplace status</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(MARKETPLACE_AUDIENCE_FILTER_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setAudience((a) => ({
                      ...a,
                      marketplaceFilters: toggleArrayValue(
                        a.marketplaceFilters,
                        key as keyof typeof MARKETPLACE_AUDIENCE_FILTER_LABELS
                      ),
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs ${
                    audience.marketplaceFilters?.includes(
                      key as keyof typeof MARKETPLACE_AUDIENCE_FILTER_LABELS
                    )
                      ? "bg-emerald-700 text-white"
                      : "bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Manual selection</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search contacts" className="rounded-lg border p-2 text-sm" />
              <button type="button" onClick={() => void searchContacts()} className="rounded-lg border px-3 py-2 text-sm">Search</button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {contactResults.map((row) => (
                <li key={row.crm_contact_id} className="flex flex-wrap items-center gap-2">
                  <span>{row.contact_name} · {row.organisation_name || "—"} · {row.email || "no email"}</span>
                  <button type="button" className="text-xs text-emerald-700" onClick={() => setAudience((a) => ({ ...a, manualIncludeContactIds: toggleArrayValue(a.manualIncludeContactIds, row.crm_contact_id) }))}>Include</button>
                  <button type="button" className="text-xs text-red-700" onClick={() => setAudience((a) => ({ ...a, manualExcludeContactIds: toggleArrayValue(a.manualExcludeContactIds, row.crm_contact_id) }))}>Exclude</button>
                </li>
              ))}
            </ul>
          </fieldset>
          <button type="button" onClick={() => void runPreview()} className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
            Preview recipients
          </button>
        </section>
      ) : null}

      {step === 4 && preview ? (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
          <p>Total matched: {preview.totalMatching}</p>
          <p>Eligible: {preview.eligibleRecipients}</p>
          <p>Excluded: {preview.excludedRecipients}</p>
          <p>Duplicate emails: {preview.duplicateEmailCount}</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Eligible sample</h3>
              <ul className="mt-2 max-h-48 overflow-auto">
                {preview.eligible.slice(0, 20).map((row) => (
                  <li key={row.marketingContactId}>{row.contactName} · {row.email}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">Excluded sample</h3>
              <ul className="mt-2 max-h-48 overflow-auto">
                {preview.excluded.slice(0, 20).map((row) => (
                  <li key={row.marketingContactId}>{row.contactName} · {row.reason}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Desktop preview</h3>
            {renderedHtml ? (
              <iframe title="Desktop preview" className="mt-2 h-[480px] w-full rounded-lg border bg-white" srcDoc={renderedHtml} />
            ) : (
              <p className="mt-2 text-sm text-gray-500">Save draft to render preview.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Summary</h3>
            <dl className="mt-2 space-y-1 text-sm">
              <div><dt className="inline font-medium">Subject: </dt><dd className="inline">{subject}</dd></div>
              <div><dt className="inline font-medium">Template: </dt><dd className="inline">{selectedTemplate?.name || "—"}</dd></div>
              <div><dt className="inline font-medium">Sender: </dt><dd className="inline">{senderName} &lt;{senderEmail || "default"}&gt;</dd></div>
              <div><dt className="inline font-medium">Eligible recipients: </dt><dd className="inline">{preview?.eligibleRecipients ?? "—"}</dd></div>
            </dl>
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm">Campaign draft {campaignId ? "updated" : "ready to save"}.</p>
          <button type="button" disabled={saving} onClick={() => void saveDraft()} className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save draft"}
          </button>
          <div className="flex flex-wrap items-end gap-2">
            <input value={testEmails} onChange={(e) => setTestEmails(e.target.value)} placeholder="Test email addresses" className="rounded-lg border p-2 text-sm" />
            <button type="button" onClick={() => void runTestSend()} className="rounded-lg border px-4 py-2 text-sm">Send test email</button>
          </div>
          <button type="button" disabled className="rounded-lg bg-gray-200 px-4 py-2 text-sm text-gray-500" title="Production sending disabled">
            Send now (disabled)
          </button>
          <p className="text-xs text-gray-500">
            Production sending will be enabled after sender-domain verification, unsubscribe testing,
            suppression handling, recipient re-checks and delivery monitoring are complete.
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="rounded-lg border px-4 py-2 text-sm">
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
            Continue
          </button>
        ) : null}
        <Link href="/admin/crm/marketing/campaigns" className="rounded-lg border px-4 py-2 text-sm">
          Back to campaigns
        </Link>
      </div>
    </div>
  );
}
