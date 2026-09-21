export async function postHostBookingResponse(params: {
  accessToken: string;
  bookingId: string;
  action: "approve" | "decline";
  message?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  competingDeclinedIds?: string[];
  ownerResponseBy?: string;
}> {
  const res = await fetch(`/api/bookings/${params.bookingId}/host-response`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: params.action,
      message: params.message ?? null,
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    competingDeclinedIds?: string[];
    ownerResponseBy?: string;
  } | null;
  if (!res.ok || !json?.ok) {
    return { ok: false, error: json?.error || "Could not update booking." };
  }
  return {
    ok: true,
    competingDeclinedIds: json.competingDeclinedIds || [],
    ownerResponseBy: json.ownerResponseBy,
  };
}
