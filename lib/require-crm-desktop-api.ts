import { NextRequest, NextResponse } from "next/server";
import {
  canAccessCrmDesktop,
  CRM_DESKTOP_ACCESS_DENIED,
} from "@/lib/crm-desktop/access";
import { requireCrmApi, type CrmAuthOk } from "@/lib/require-crm-api";

export type CrmDesktopAuthOk = CrmAuthOk;

export type CrmDesktopAuthFail = { response: NextResponse };

export async function requireCrmDesktopApi(
  req: NextRequest
): Promise<CrmDesktopAuthOk | CrmDesktopAuthFail> {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth;

  if (
    !canAccessCrmDesktop({
      crmRole: auth.crmRole,
      platformRole: auth.platformRole,
    })
  ) {
    return {
      response: NextResponse.json(
        { error: CRM_DESKTOP_ACCESS_DENIED },
        { status: 403 }
      ),
    };
  }

  return auth;
}
