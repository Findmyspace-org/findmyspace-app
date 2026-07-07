import { NextRequest, NextResponse } from "next/server";
import { requireCrmDesktopApi } from "@/lib/require-crm-desktop-api";
import {
  addMarketingContactToList,
  removeMarketingContactFromList,
  suppressMarketingContact,
} from "@/lib/crm-marketing/mutations";

type BulkBody = {
  action: "add_to_list" | "remove_from_list" | "suppress";
  marketingContactIds: string[];
  listId?: string;
  suppressionReason?: string;
  note?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireCrmDesktopApi(req);
  if ("response" in auth) return auth.response;

  const body = (await req.json()) as BulkBody;
  if (!body.marketingContactIds?.length) {
    return NextResponse.json({ error: "No contacts selected." }, { status: 400 });
  }

  const results = { succeeded: 0, failed: 0, errors: [] as string[] };

  try {
    for (const marketingContactId of body.marketingContactIds) {
      try {
        if (body.action === "add_to_list") {
          if (!body.listId) throw new Error("List ID is required.");
          await addMarketingContactToList(auth.adminClient, {
            marketingContactId,
            listId: body.listId,
            actorId: auth.userId,
          });
        } else if (body.action === "remove_from_list") {
          if (!body.listId) throw new Error("List ID is required.");
          await removeMarketingContactFromList(auth.adminClient, {
            marketingContactId,
            listId: body.listId,
            actorId: auth.userId,
          });
        } else if (body.action === "suppress") {
          if (!body.suppressionReason) throw new Error("Suppression reason is required.");
          await suppressMarketingContact(auth.adminClient, {
            marketingContactId,
            actorId: auth.userId,
            suppressionReason: body.suppressionReason,
            note: body.note,
          });
        } else {
          throw new Error("Unknown bulk action.");
        }
        results.succeeded++;
      } catch (error) {
        results.failed++;
        results.errors.push(
          error instanceof Error ? error.message : "Bulk action failed for one contact."
        );
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk action failed." },
      { status: 400 }
    );
  }
}
