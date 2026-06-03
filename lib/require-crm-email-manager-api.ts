import { NextRequest, NextResponse } from "next/server";
import { canManageCrmEmail } from "@/lib/space-place/access";
import { requireCrmApi, type CrmAuthOk, type CrmAuthFail } from "@/lib/require-crm-api";

export type CrmEmailManagerAuthOk = CrmAuthOk;
export type CrmEmailManagerAuthFail = CrmAuthFail;

export async function requireCrmEmailManagerApi(
  req: NextRequest
): Promise<CrmEmailManagerAuthOk | CrmEmailManagerAuthFail> {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth;

  if (!canManageCrmEmail(auth.crmRole)) {
    return {
      response: NextResponse.json(
        { error: "Admin or office manager access required." },
        { status: 403 }
      ),
    };
  }

  return auth;
}
