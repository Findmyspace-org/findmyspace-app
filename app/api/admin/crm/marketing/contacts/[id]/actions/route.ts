import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  addMarketingContactToList,
  markMarketingUnsubscribed,
  recordMarketingConsent,
  refreshMarketingEmailFromCrm,
  removeMarketingContactFromList,
  removeMarketingSuppression,
  suppressMarketingContact,
  withdrawMarketingConsent,
} from "@/lib/crm-marketing/mutations";

type ActionBody = {
  action:
    | "record_consent"
    | "withdraw_consent"
    | "mark_unsubscribed"
    | "suppress"
    | "remove_suppression"
    | "add_to_list"
    | "remove_from_list"
    | "refresh_email";
  consentStatus?: string;
  lawfulBasis?: string;
  consentSource?: string;
  consentRecordedAt?: string;
  evidenceNote?: string;
  suppressionReason?: string;
  note?: string;
  reason?: string;
  listId?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = (await req.json()) as ActionBody;

  try {
    switch (body.action) {
      case "record_consent":
        if (!body.consentSource?.trim()) {
          return NextResponse.json({ error: "Consent source is required." }, { status: 400 });
        }
        await recordMarketingConsent(auth.adminClient, {
          marketingContactId: id,
          actorId: auth.userId,
          consentStatus: body.consentStatus || "granted",
          lawfulBasis: body.lawfulBasis || "consent",
          consentSource: body.consentSource,
          consentRecordedAt: body.consentRecordedAt,
          evidenceNote: body.evidenceNote,
        });
        break;
      case "withdraw_consent":
        await withdrawMarketingConsent(auth.adminClient, {
          marketingContactId: id,
          actorId: auth.userId,
          reason: body.reason,
        });
        break;
      case "mark_unsubscribed":
        await markMarketingUnsubscribed(auth.adminClient, {
          marketingContactId: id,
          actorId: auth.userId,
          reason: body.reason,
        });
        break;
      case "suppress":
        if (!body.suppressionReason) {
          return NextResponse.json({ error: "Suppression reason is required." }, { status: 400 });
        }
        await suppressMarketingContact(auth.adminClient, {
          marketingContactId: id,
          actorId: auth.userId,
          suppressionReason: body.suppressionReason,
          note: body.note,
        });
        break;
      case "remove_suppression":
        if (!body.reason?.trim()) {
          return NextResponse.json({ error: "Removal reason is required." }, { status: 400 });
        }
        await removeMarketingSuppression(auth.adminClient, {
          marketingContactId: id,
          actorId: auth.userId,
          reason: body.reason,
        });
        break;
      case "add_to_list":
        if (!body.listId) {
          return NextResponse.json({ error: "List ID is required." }, { status: 400 });
        }
        await addMarketingContactToList(auth.adminClient, {
          marketingContactId: id,
          listId: body.listId,
          actorId: auth.userId,
        });
        break;
      case "remove_from_list":
        if (!body.listId) {
          return NextResponse.json({ error: "List ID is required." }, { status: 400 });
        }
        await removeMarketingContactFromList(auth.adminClient, {
          marketingContactId: id,
          listId: body.listId,
          actorId: auth.userId,
        });
        break;
      case "refresh_email":
        await refreshMarketingEmailFromCrm(auth.adminClient, {
          marketingContactId: id,
          actorId: auth.userId,
        });
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 400 }
    );
  }
}
