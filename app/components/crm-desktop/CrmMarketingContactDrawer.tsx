"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CrmDesktopDrawer } from "./CrmDesktopDrawer";
import {
  MARKETING_LAWFUL_BASES,
  SUPPRESSION_REASONS,
  SUPPRESSION_REASON_LABELS,
} from "@/lib/crm-marketing/constants";
import {
  fetchMarketingContactDetail,
  fetchMarketingLists,
  postMarketingContactAction,
} from "@/lib/crm-marketing/api-client";
import type { CrmMarketingContactDetail } from "@/lib/crm-marketing/types";

type Props = {
  marketingContactId: string | null;
  onClose: () => void;
  onUpdated: () => void;
};

export function CrmMarketingContactDrawer({
  marketingContactId,
  onClose,
  onUpdated,
}: Props) {
  const [contact, setContact] = useState<CrmMarketingContactDetail | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [action, setAction] = useState<string>("");
  const [listId, setListId] = useState("");
  const [consentSource, setConsentSource] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("consent");
  const [suppressionReason, setSuppressionReason] = useState("other");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!marketingContactId) {
      setContact(null);
      return;
    }
    void load(marketingContactId);
  }, [marketingContactId]);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [detail, allLists] = await Promise.all([
        fetchMarketingContactDetail(id),
        fetchMarketingLists(),
      ]);
      setContact(detail);
      setLists(allLists.map((list) => ({ id: list.id, name: list.name })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(payload: Record<string, unknown>, message: string) {
    if (!marketingContactId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await postMarketingContactAction(marketingContactId, payload);
      setSuccess(message);
      await load(marketingContactId);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrmDesktopDrawer
      open={Boolean(marketingContactId)}
      title={contact?.contact_name || "Marketing contact"}
      subtitle={contact?.organisation_name || undefined}
      onClose={onClose}
      saving={saving}
      error={error}
      success={success}
      widthClass="max-w-2xl"
    >
      {loading ? <p className="text-sm text-gray-500">Loading contact…</p> : null}
      {contact ? (
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-[#192a3a]">CRM identity</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Organisation</dt><dd>{contact.organisation_name || "—"}</dd></div>
              <div><dt className="text-gray-500">Type</dt><dd>{contact.organisation_type || "—"}</dd></div>
              <div><dt className="text-gray-500">Role</dt><dd>{contact.role || "—"}</dd></div>
              <div><dt className="text-gray-500">Email</dt><dd>{contact.email || "—"}</dd></div>
              <div><dt className="text-gray-500">Phone</dt><dd>{contact.phone || "—"}</dd></div>
              <div><dt className="text-gray-500">Pipeline stage</dt><dd>{contact.pipeline_stage || "—"}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href={`/admin/crm/contacts/${contact.crm_contact_id}`} className="text-[#c1121f] hover:underline">
                Open CRM contact
              </Link>
              {contact.crm_organisation_id ? (
                <Link href={`/admin/crm/organisations/${contact.crm_organisation_id}`} className="text-[#c1121f] hover:underline">
                  Open organisation
                </Link>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[#192a3a]">Marketing status</h3>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Status</dt><dd>{contact.status}</dd></div>
              <div><dt className="text-gray-500">Consent</dt><dd>{contact.consent_status}</dd></div>
              <div><dt className="text-gray-500">Lawful basis</dt><dd>{contact.lawful_basis}</dd></div>
              <div><dt className="text-gray-500">Consent source</dt><dd>{contact.consent_source || "—"}</dd></div>
              <div><dt className="text-gray-500">Sendable</dt><dd>{contact.sendable ? "Yes" : `No — ${contact.eligibility_reason}`}</dd></div>
              <div><dt className="text-gray-500">Lists</dt><dd>{contact.lists.join(", ") || "—"}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[#192a3a]">Actions</h3>
            <div className="mt-2 space-y-3">
              <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2 text-sm">
                <option value="">Choose action…</option>
                <option value="record_consent">Record consent</option>
                <option value="withdraw_consent">Withdraw consent</option>
                <option value="mark_unsubscribed">Mark unsubscribed</option>
                <option value="suppress">Suppress contact</option>
                <option value="remove_suppression">Remove suppression</option>
                <option value="add_to_list">Add to list</option>
                <option value="remove_from_list">Remove from list</option>
                <option value="refresh_email">Refresh email from CRM</option>
              </select>

              {action === "record_consent" ? (
                <div className="space-y-2">
                  <select value={lawfulBasis} onChange={(e) => setLawfulBasis(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2 text-sm">
                    {MARKETING_LAWFUL_BASES.map((basis) => (
                      <option key={basis} value={basis}>{basis}</option>
                    ))}
                  </select>
                  <input value={consentSource} onChange={(e) => setConsentSource(e.target.value)} placeholder="Consent source" className="w-full rounded-lg border border-gray-200 p-2 text-sm" />
                </div>
              ) : null}

              {action === "suppress" ? (
                <select value={suppressionReason} onChange={(e) => setSuppressionReason(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2 text-sm">
                  {SUPPRESSION_REASONS.map((item) => (
                    <option key={item} value={item}>{SUPPRESSION_REASON_LABELS[item]}</option>
                  ))}
                </select>
              ) : null}

              {action === "remove_suppression" || action === "withdraw_consent" || action === "mark_unsubscribed" ? (
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="w-full rounded-lg border border-gray-200 p-2 text-sm" />
              ) : null}

              {(action === "add_to_list" || action === "remove_from_list") ? (
                <select value={listId} onChange={(e) => setListId(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2 text-sm">
                  <option value="">Select list…</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              ) : null}

              {action ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (action === "record_consent") {
                      void runAction({
                        action,
                        consentStatus: "granted",
                        lawfulBasis,
                        consentSource,
                        evidenceNote: reason || undefined,
                      }, "Consent recorded.");
                    } else if (action === "withdraw_consent") {
                      void runAction({ action, reason }, "Consent withdrawn.");
                    } else if (action === "mark_unsubscribed") {
                      void runAction({ action, reason }, "Marked unsubscribed.");
                    } else if (action === "suppress") {
                      void runAction({ action, suppressionReason, note: reason }, "Contact suppressed.");
                    } else if (action === "remove_suppression") {
                      void runAction({ action, reason }, "Suppression removed.");
                    } else if (action === "add_to_list" || action === "remove_from_list") {
                      void runAction({ action, listId }, "List membership updated.");
                    } else if (action === "refresh_email") {
                      void runAction({ action }, "Email refreshed from CRM.");
                    }
                  }}
                  className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  Apply action
                </button>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[#192a3a]">Audit history</h3>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
              {contact.audits.map((audit) => (
                <li key={audit.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                  <p className="font-medium">{audit.action}</p>
                  <p className="text-gray-500">{new Date(audit.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[#192a3a]">Communication history</h3>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">
              {contact.communications.length ? contact.communications.map((item) => (
                <li key={item.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                  <p className="font-medium">{item.summary || item.type}</p>
                  <p className="text-gray-500">{item.outcome || "—"}</p>
                </li>
              )) : (
                <li className="text-gray-500">No CRM engagement history for this contact.</li>
              )}
            </ul>
          </section>
        </div>
      ) : null}
    </CrmDesktopDrawer>
  );
}
