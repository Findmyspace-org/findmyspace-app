import { supabase } from "@/lib/supabase";

/**
 * Download invoice PDF (browser). Uses the same auth and document as HTML invoice.
 */
export async function downloadInvoicePdf(
  bookingId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, message: "Sign in to download your invoice." };
  }

  const res = await fetch(`/api/invoice/${bookingId}/pdf`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text || "Could not download PDF.";
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* plain text body */
    }
    return { ok: false, message: msg };
  }

  const cd = res.headers.get("Content-Disposition");
  let filename = `FindMySpace-invoice-${bookingId.slice(0, 8)}.pdf`;
  const m = cd?.match(/filename="?([^";]+)"?/i);
  if (m?.[1]) filename = m[1];

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { ok: true };
}
