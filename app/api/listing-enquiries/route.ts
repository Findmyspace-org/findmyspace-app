import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import {
  emailStrong,
  renderEmailLayout,
} from "@/lib/email-templates/EmailLayout";
import {
  buildListingEnquiryAdminCopy,
  buildListingEnquiryRequesterCopy,
} from "@/lib/communication-copy";
import {
  isUnclaimedListing,
  LISTING_ENQUIRY_DURATION_TYPES,
} from "@/lib/listing-lifecycle";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";

type EnquiryBody = {
  listingId?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  requestedStart?: string | null;
  requestedEnd?: string | null;
  durationType?: string;
  purpose?: string | null;
  message?: string | null;
};

function getServerClients(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { error: "Server configuration error." as const };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Unauthorized." as const };
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { userClient, admin, supabaseUrl, serviceKey, anonKey };
}

async function notifyListingEnquiry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: {
    enquiryId: string;
    listingId: string;
    listingTitle: string;
    requesterId: string;
    requesterName: string;
    requesterEmail: string;
  }
) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  const appBaseUrl = getCanonicalPublicSiteUrl();
  const adminInboxUrl = `${appBaseUrl}/admin/listing-enquiries`;
  const listingUrl = `${appBaseUrl}/spaces/${params.listingId}`;

  const adminCopy = buildListingEnquiryAdminCopy({
    listingTitle: params.listingTitle,
    requesterName: params.requesterName,
    requesterEmail: params.requesterEmail,
  });

  if (adminEmail) {
    const rendered = renderEmailLayout({
      preheader: adminCopy.emailPreheader,
      title: adminCopy.emailTitle,
      bodyLines: adminCopy.emailBodyLines,
      primaryCTA: { label: adminCopy.ctaLabel, href: adminInboxUrl },
      footerRole: adminCopy.emailFooterRole,
    });
    await sendEmail({
      to: adminEmail,
      subject: adminCopy.emailSubject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  for (const row of (admins as { id: string }[]) || []) {
    await admin.from("notifications").insert({
      user_id: row.id,
      role: "admin",
      type: "listing_enquiry",
      title: adminCopy.notificationTitle,
      message: adminCopy.notificationMessage,
      href: "/admin/listing-enquiries",
      related_entity_type: "listing_enquiry",
      related_entity_id: params.enquiryId,
      is_read: false,
    });
  }

  const requesterCopy = buildListingEnquiryRequesterCopy({
    listingTitle: params.listingTitle,
    listingUrl,
  });

  await admin.from("notifications").insert({
    user_id: params.requesterId,
    role: "renter",
    type: "listing_enquiry_received",
    title: requesterCopy.notificationTitle,
    message: requesterCopy.notificationMessage,
    href: listingUrl,
    related_entity_type: "listing_enquiry",
    related_entity_id: params.enquiryId,
    is_read: false,
  });
}

export async function POST(req: NextRequest) {
  const clients = getServerClients(req);
  if ("error" in clients) {
    return NextResponse.json({ error: clients.error }, { status: 401 });
  }

  const { userClient, admin } = clients;

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: EnquiryBody;
  try {
    body = (await req.json()) as EnquiryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const listingId = body.listingId?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim();
  const durationType = body.durationType?.trim();

  if (!listingId || !name || !email || !durationType) {
    return NextResponse.json(
      { error: "listingId, name, email, and durationType are required." },
      { status: 400 }
    );
  }

  if (!(LISTING_ENQUIRY_DURATION_TYPES as readonly string[]).includes(durationType)) {
    return NextResponse.json({ error: "Invalid duration type." }, { status: 400 });
  }

  const { data: listing, error: listingErr } = await (
    admin.from("spaces") as ReturnType<typeof admin.from>
  )
    .select("id, title, status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingErr || !listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const listingRow = listing as { id: string; title: string; status: string | null };
  if (!isUnclaimedListing(listingRow.status)) {
    return NextResponse.json(
      { error: "Enquiries are only accepted for unclaimed listings." },
      { status: 400 }
    );
  }

  const { data: inserted, error: insertErr } = await (
    admin.from("listing_enquiries") as ReturnType<typeof admin.from>
  )
    .insert({
      listing_id: listingId,
      requester_id: user.id,
      name,
      email,
      phone: body.phone?.trim() || null,
      requested_start: body.requestedStart || null,
      requested_end: body.requestedEnd || null,
      duration_type: durationType,
      purpose: body.purpose?.trim() || null,
      message: body.message?.trim() || null,
      status: "new",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[listing-enquiries] insert failed", insertErr?.message);
    return NextResponse.json(
      { error: insertErr?.message || "Could not save enquiry." },
      { status: 500 }
    );
  }

  const enquiryId = (inserted as { id: string }).id;

  try {
    await notifyListingEnquiry(admin, {
      enquiryId,
      listingId,
      listingTitle: listingRow.title || "Untitled listing",
      requesterId: user.id,
      requesterName: name,
      requesterEmail: email,
    });
  } catch (err) {
    console.error("[listing-enquiries] notification failed", err);
  }

  return NextResponse.json({ ok: true, id: enquiryId });
}
