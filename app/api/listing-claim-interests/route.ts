import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import { buildListingClaimInterestAdminCopy } from "@/lib/communication-copy";
import { isUnclaimedListing } from "@/lib/listing-lifecycle";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type ClaimInterestBody = {
  listingId?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  role?: string | null;
  message?: string | null;
};

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: ClaimInterestBody;
  try {
    body = (await req.json()) as ClaimInterestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const listingId = body.listingId?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim();
  const role = body.role?.trim() || null;

  if (!listingId || !name || !email) {
    return NextResponse.json(
      { error: "listingId, name, and email are required." },
      { status: 400 }
    );
  }

  if (!email.includes("@")) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: listing, error: listingErr } = await admin
    .from("spaces")
    .select("id, title, status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingErr || !listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const listingRow = listing as { id: string; title: string | null; status: string | null };
  if (!isUnclaimedListing(listingRow.status)) {
    return NextResponse.json(
      { error: "Claim interest is only accepted for unclaimed listings." },
      { status: 400 }
    );
  }

  const { data: inserted, error: insertErr } = await admin
    .from("listing_claim_interests")
    .insert({
      listing_id: listingId,
      name,
      email,
      phone: body.phone?.trim() || null,
      role,
      message: body.message?.trim() || null,
      status: "new",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[listing-claim-interests] insert failed", insertErr?.message);
    return NextResponse.json(
      { error: insertErr?.message || "Could not save your request." },
      { status: 500 }
    );
  }

  const interestId = (inserted as { id: string }).id;
  const listingTitle = listingRow.title || "Untitled listing";
  const appBaseUrl = getCanonicalPublicSiteUrl();
  const adminEditUrl = `${appBaseUrl}/admin/unclaimed-listings/${listingId}/edit`;

  try {
    const copy = buildListingClaimInterestAdminCopy({
      listingTitle,
      contactName: name,
      contactEmail: email,
      role,
    });

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      const rendered = renderEmailLayout({
        preheader: copy.emailPreheader,
        title: copy.emailTitle,
        bodyLines: copy.emailBodyLines,
        primaryCTA: { label: copy.ctaLabel, href: adminEditUrl },
        footerRole: copy.emailFooterRole,
      });
      await sendEmail({
        to: adminEmail,
        subject: copy.emailSubject,
        html: rendered.html,
        text: rendered.text,
      });
    }

    const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");

    for (const row of (admins as { id: string }[]) || []) {
      await admin.from("notifications").insert({
        user_id: row.id,
        role: "admin",
        type: "listing_claim_interest",
        title: copy.notificationTitle,
        message: copy.notificationMessage,
        href: `/admin/unclaimed-listings/${listingId}/edit`,
        related_entity_type: "listing_claim_interest",
        related_entity_id: interestId,
        is_read: false,
      });
    }
  } catch (err) {
    console.error("[listing-claim-interests] notify failed", err);
  }

  return NextResponse.json({ ok: true, id: interestId });
}
