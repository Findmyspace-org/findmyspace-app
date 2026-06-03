import type { CrmRole } from "@/lib/space-place/constants";

type CrmWriteLogContext = {
  operation: string;
  table: string;
  userId: string;
  platformRole: string | null;
  crmRole: CrmRole | string;
  error: { message?: string; code?: string; details?: string };
};

export function logCrmWriteFailure(ctx: CrmWriteLogContext): void {
  console.error("[crm-write]", JSON.stringify(ctx));
}

export function publicCrmDbError(
  error: { message?: string } | null | undefined,
  fallback: string
): string {
  const message = error?.message || fallback;
  if (message.toLowerCase().includes("permission denied")) {
    return `${message} If this persists, ensure SUPABASE_SERVICE_ROLE_KEY is set on the server and migration 006 (crm service_role grants) has been applied.`;
  }
  return message;
}
