import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/require-admin-api";
import { checkAiKnowledgeSetup } from "@/lib/space-ai-knowledge-setup";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminApi(req);
    if ("response" in auth) return auth.response;

    const admin = getAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const health = await checkAiKnowledgeSetup(admin);
    return NextResponse.json(health);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Setup health check failed.",
      },
      { status: 500 }
    );
  }
}
