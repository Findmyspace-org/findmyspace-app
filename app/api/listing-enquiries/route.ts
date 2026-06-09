import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderEmailLayout } from "@/lib/email-templates/EmailLayout";
import {
  buildListingEnquiryAdminCopy,
  buildListingEnquiryRequesterCopy,
} from "@/lib/communication-copy";
import {
  isUnclaimedListing,
  LISTING_ENQUIRY_DURATION_TYPES,
} from "@/lib/listing-lifecycle";
import { getCanonicalPublicSiteUrl } from "@/lib/site-url";
import {
  formatCrmLinkForAdminNotice,
  loadSpaceCrmContextForListing,
} from "@/lib/space-crm-link";

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

function resolveRequesterContact(
  user: { id: string; email?: string | null },
  profile: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null
): { name: string; email: string; phone: string | null } {
  const fullName =
    profile?.full_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const email = profile?.email?.trim() || user.email?.trim() || "";
  const name = fullName || (email ? email.split("@")[0] : "User");
  return {
    name,
    email,
    phone: profile?.phone?.trim() || null,
  };
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function getAuthenticatedUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function notifyListingEnquiry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: {
    enquiryId: string;
    listingId: string;
    listingTitle: string;
    requesterId: string | null;
    requesterName: string;
    requesterEmail: string;
    crmNotice?: string | null;
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

  const crmSuffix = params.crmNotice ? ` CRM: ${params.crmNotice}.` : "";
  const notificationMessage = `${adminCopy.notificationMessage}${crmSuffix}`;
  const emailBodyLines = params.crmNotice
    ? [...adminCopy.emailBodyLines, `CRM link: ${params.crmNotice}`]
    : adminCopy.emailBodyLines;

  if (adminEmail) {
    const rendered = renderEmailLayout({
      preheader: adminCopy.emailPreheader,
      title: adminCopy.emailTitle,
      bodyLines: emailBodyLines,
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
      message: notificationMessage,
      href: `/admin/listing-enquiries?open=${params.enquiryId}`,
      related_entity_type: "listing_enquiry",
      related_entity_id: params.enquiryId,
      is_read: false,
    });
  }

  if (!params.requesterId) return;

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
  const admin = createServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  let body: EnquiryBody;
  try {
    body = (await req.json()) as EnquiryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const listingId = body.listingId?.trim();
  const durationType = body.durationType?.trim();

  if (!listingId || !durationType) {
    return NextResponse.json(
      { error: "listingId and durationType are required." },
      { status: 400 }
    );
  }

  if (!(LISTING_ENQUIRY_DURATION_TYPES as readonly string[]).includes(durationType)) {
    return NextResponse.json({ error: "Invalid duration type." }, { status: 400 });
  }

  const user = await getAuthenticatedUser(req);

  let name: string;
  let email: string;
  let phone: string | null;
  let requesterId: string | null = null;

  if (user) {
    requesterId = user.id;

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("first_name, last_name, full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const contact = resolveRequesterContact(
      user,
      profile as {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
      } | null
    );

    name = contact.name;
    email = contact.email;
    phone = contact.phone;

    if (!email) {
      return NextResponse.json(
        { error: "Your account must have an email address to submit a request." },
        { status: 400 }
      );
    }
  } else {
    name = body.name?.trim() || "";
    email = body.email?.trim() || "";
    phone = body.phone?.trim() || null;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
  }

  const { data: listing, error: listingErr } = await admin
    .from("spaces")
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

  const { data: inserted, error: insertErr } = await admin
    .from("listing_enquiries")
    .insert({
      listing_id: listingId,
      requester_id: requesterId,
      name,
      email,
      phone,
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

  let crmNotice: string | null = null;
  try {
    const crmContext = await loadSpaceCrmContextForListing(admin, listingId);
    if (crmContext) {
      crmNotice = formatCrmLinkForAdminNotice(crmContext);
    }
  } catch {
    // non-blocking
  }

  try {
    await notifyListingEnquiry(admin, {
      enquiryId,
      listingId,
      listingTitle: listingRow.title || "Untitled listing",
      requesterId,
      requesterName: name,
      requesterEmail: email,
      crmNotice,
    });
  } catch (err) {
    console.error("[listing-enquiries] notification failed", err);
  }

  return NextResponse.json({ ok: true, id: enquiryId });
}
