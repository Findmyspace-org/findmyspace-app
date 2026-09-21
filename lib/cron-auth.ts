import type { NextRequest } from "next/server";

/**
 * Vercel Cron auth: Authorization: Bearer <CRON_SECRET>.
 * Fails closed when CRON_SECRET is missing. Never log or return the secret.
 * @see https://vercel.com/docs/cron-jobs/manage-cron-jobs
 */
export function isVercelCronAuthorized(request: Request | NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return false;
  }

  return true;
}

export function unauthorizedCronResponse(): Response {
  return new Response("Unauthorized", { status: 401 });
}
