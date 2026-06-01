import { NextRequest, NextResponse } from "next/server";
import { requireCrmApi, type CrmAuthOk, type CrmAuthFail } from "@/lib/require-crm-api";

export type CrmAdminAuthOk = CrmAuthOk;
export type CrmAdminAuthFail = CrmAuthFail;

export async function requireCrmAdminApi(
  req: NextRequest
): Promise<CrmAdminAuthOk | CrmAdminAuthFail> {
  const auth = await requireCrmApi(req);
  if ("response" in auth) return auth;

  if (auth.crmRole !== "admin") {
    return {
      response: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  return auth;
}
