import { NextRequest, NextResponse } from "next/server";
import {
  getLastEmailImportRun,
  isEmailImportConfigured,
  readEmailImportEnv,
  runCrmEmailImport,
  type EmailImportOptions,
} from "@/lib/space-place/email-import-server";
import { getCrmCaptureEmail } from "@/lib/space-place/crm-email";
import {
  DEFAULT_EMAIL_IMPORT_FOLDER,
  DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS,
} from "@/lib/space-place/email-import-helpers";
import { requireCrmEmailManagerApi } from "@/lib/require-crm-email-manager-api";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Check IMAP env configuration (no secrets returned). */
export async function GET(req: NextRequest) {
  const auth = await requireCrmEmailManagerApi(req);
  if ("response" in auth) return auth.response;

  const env = readEmailImportEnv();
  const last = env
    ? await getLastEmailImportRun(auth.adminClient)
    : { lastSuccessfulImportAt: null, lastError: null, lastRun: null };

  return NextResponse.json({
    configured: isEmailImportConfigured(),
    captureEmail: getCrmCaptureEmail(),
    host: env?.host ?? null,
    port: env?.port ?? null,
    user: env?.user ?? null,
    secure: env?.secure ?? true,
    folder: DEFAULT_EMAIL_IMPORT_FOLDER,
    defaultDaysBack: DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS,
    lastSuccessfulImportAt: last.lastSuccessfulImportAt,
    lastError: last.lastError,
    lastRun: last.lastRun,
    hint: env
      ? `POST to import from ${DEFAULT_EMAIL_IMPORT_FOLDER} (default last ${DEFAULT_EMAIL_IMPORT_LOOKBACK_DAYS} days, read + unread).`
      : "Set CRM_EMAIL_HOST, CRM_EMAIL_USER, and CRM_EMAIL_PASSWORD on the server (Vercel).",
  });
}

type ImportBody = {
  daysBack?: number;
  unreadOnly?: boolean;
  folder?: string;
  batchSize?: number;
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

  const options: EmailImportOptions = { createdBy: auth.userId };
  try {
    const body = (await req.json()) as ImportBody;
    if (typeof body.daysBack === "number") options.daysBack = body.daysBack;
    if (typeof body.unreadOnly === "boolean") options.unreadOnly = body.unreadOnly;
    if (typeof body.folder === "string") options.folder = body.folder;
    if (typeof body.batchSize === "number") options.batchSize = body.batchSize;
  } catch {
    // empty body is fine — defaults apply
  }

  try {
    const result = await runCrmEmailImport(auth.adminClient, env, options);
    return NextResponse.json({ ok: true, configured: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email import failed.";
    console.error("[email-import]", message);
    const last = await getLastEmailImportRun(auth.adminClient);
    return NextResponse.json(
      {
        error: message,
        configured: true,
        lastSuccessfulImportAt: last.lastSuccessfulImportAt,
        lastError: message,
      },
      { status: 500 }
    );
  }
}
