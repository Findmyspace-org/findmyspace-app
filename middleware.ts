import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PRODUCTION_DATABASE_BLOCKED_MESSAGE,
  serverSupabaseTargetBlocked,
} from "@/lib/supabase-target-guard";

export function middleware(request: NextRequest) {
  if (serverSupabaseTargetBlocked() && request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: PRODUCTION_DATABASE_BLOCKED_MESSAGE }, { status: 503 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
