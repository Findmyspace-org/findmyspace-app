import { NextRequest, NextResponse } from "next/server";
import { computeListingCompletion } from "@/lib/listing-completion";
import { requireAdminApi } from "@/lib/require-admin-api";
import { createClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createServiceAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const admin = createServiceAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const completion = await computeListingCompletion(admin, id);
  if (!completion) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const { data: space } = await admin
    .from("spaces")
    .select(
      "id, title, city, suburb, status, owner_id, created_by_admin, claimed_at, submitted_for_review_at, listing_admin_comment"
    )
    .eq("id", id)
    .maybeSingle();

  let owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    owner_verification_status: string | null;
    bank_verification_status: string | null;
  } | null = null;

  const ownerId = (space as { owner_id: string | null } | null)?.owner_id;
  if (ownerId) {
    const { data } = await admin
      .from("profiles")
      .select(
        "id, first_name, last_name, email, owner_verification_status, bank_verification_status"
      )
      .eq("id", ownerId)
      .maybeSingle();
    owner = data as typeof owner;
  }

  const { data: ownershipDoc } = await admin
    .from("listing_ownership_documents")
    .select("file_url, status, uploaded_at")
    .eq("space_id", id)
    .eq("document_type", "ownership_proof")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    completion,
    space,
    owner,
    ownershipDoc,
  });
}
