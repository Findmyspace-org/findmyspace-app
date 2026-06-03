import { NextRequest, NextResponse } from "next/server";
import {
  readEmailImportEnv,
  runCrmEmailImport,
} from "@/lib/space-place/email-import-server";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const env = readEmailImportEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "CRM email import is not configured. Set CRM_EMAIL_HOST, CRM_EMAIL_PORT, CRM_EMAIL_USER, and CRM_EMAIL_PASSWORD on the server.",
      },
      { status: 500 }
    );
  }

  try {
    const result = await runCrmEmailImport(auth.adminClient, env);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email import failed.";
    console.error("[email-import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
