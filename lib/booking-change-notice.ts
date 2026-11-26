import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

type Notice = {
  userId: string;
  role: "renter" | "host";
  type: string;
  title: string;
  message: string;
  href: string;
  relatedId: string;
};

/**
 * Records an in-app booking-change notice. A real customer email is sent only
 * when BOOKING_EMAIL_MODE is "test" and the profile address equals
 * BOOKING_EMAIL_TEST_TO. Delivery is not acceptance.
 */
export async function recordBookingChangeNotice(admin: SupabaseClient, notice: Notice) {
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", notice.userId)
    .eq("type", notice.type)
    .eq("related_entity_id", notice.relatedId)
    .limit(1);
  if ((existing || []).length > 0) return { recorded: false, duplicate: true };

  await admin.from("notifications").insert({
    user_id: notice.userId,
    role: notice.role,
    type: notice.type,
    title: notice.title,
    message: notice.message,
    href: notice.href,
    related_entity_type: "booking_change_request",
    related_entity_id: notice.relatedId,
    is_read: false,
  });

  if (process.env.BOOKING_EMAIL_MODE === "test" && process.env.BOOKING_EMAIL_TEST_TO) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", notice.userId)
      .maybeSingle();
    const email = (profile as { email?: string | null } | null)?.email;
    if (email && email === process.env.BOOKING_EMAIL_TEST_TO) {
      await sendEmail({
        to: email,
        subject: notice.title,
        html: `<p>${notice.message}</p><p><a href="${notice.href}">Open the booking</a></p>`,
      });
    }
  }

  return { recorded: true, duplicate: false };
}
