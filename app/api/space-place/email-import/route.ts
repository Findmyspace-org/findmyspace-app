import { NextRequest, NextResponse } from "next/server";
import {
  isEmailImportConfigured,
  readEmailImportEnv,
  runCrmEmailImport,
  type EmailImportOptions,
} from "@/lib/space-place/email-import-server";
import { getCrmCaptureEmail } from "@/lib/space-place/crm-email";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Check IMAP env configuration (no secrets returned). */
export async function GET(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const env = readEmailImportEnv();
  return NextResponse.json({
    configured: isEmailImportConfigured(),
    captureEmail: getCrmCaptureEmail(),
    host: env?.host ?? null,
    port: env?.port ?? null,
    user: env?.user ?? null,
    secure: env?.secure ?? true,
    hint: env
      ? "POST to this route to import from INBOX (last 30 days by default)."
      : "Set CRM_EMAIL_HOST, CRM_EMAIL_USER, and CRM_EMAIL_PASSWORD on the server (Vercel).",
  });
}

type ImportBody = {
  daysBack?: number;
  unreadOnly?: boolean;
};

export async function POST(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const env = readEmailImportEnv();
  if (!env) {
    return NextResponse.json(
      {
        error:
          "CRM email import is not configured. Set CRM_EMAIL_HOST, CRM_EMAIL_PORT, CRM_EMAIL_USER, and CRM_EMAIL_PASSWORD on the server.",
        configured: false,
      },
      { status: 500 }
    );
  }

  let options: EmailImportOptions = {};
  try {
    const body = (await req.json()) as ImportBody;
    if (typeof body.daysBack === "number") options.daysBack = body.daysBack;
    if (typeof body.unreadOnly === "boolean") options.unreadOnly = body.unreadOnly;
  } catch {
    // empty body is fine
  }

  try {
    const result = await runCrmEmailImport(auth.adminClient, env, options);
    return NextResponse.json({ ok: true, configured: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email import failed.";
    console.error("[email-import]", message);
    return NextResponse.json({ error: message, configured: true }, { status: 500 });
  }
}
