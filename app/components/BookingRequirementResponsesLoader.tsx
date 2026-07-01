"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BookingRequirementResponsesPanel } from "@/app/components/BookingRequirementResponsesPanel";
import type { BookingTermsAcceptanceSnapshot } from "@/lib/property-booking-terms";
import type { BookingRequirementResponseRow } from "@/lib/space-booking-requirement-fields";

type Props = {
  bookingId: string;
  infoUrl?: string;
  title?: string;
};

export function BookingRequirementResponsesLoader({
  bookingId,
  infoUrl,
  title,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [terms, setTerms] = useState<BookingTermsAcceptanceSnapshot | null>(null);
  const [responses, setResponses] = useState<BookingRequirementResponseRow[]>([]);
  const [contactDetailsRedacted, setContactDetailsRedacted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (!cancelled) setLoading(false);
        return;
      }

      const url = infoUrl ?? `/api/bookings/${bookingId}/requirement-info`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = (await res.json().catch(() => null)) as {
        terms?: BookingTermsAcceptanceSnapshot | null;
        responses?: BookingRequirementResponseRow[];
        contactDetailsRedacted?: boolean;
      } | null;

      if (cancelled) return;

      if (res.ok) {
        setTerms(json?.terms ?? null);
        setResponses(json?.responses ?? []);
        setContactDetailsRedacted(Boolean(json?.contactDetailsRedacted));
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookingId, infoUrl]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading renter information…
      </div>
    );
  }

  return (
    <BookingRequirementResponsesPanel
      terms={terms}
      responses={responses}
      title={title}
      contactDetailsRedacted={contactDetailsRedacted}
    />
  );
}
