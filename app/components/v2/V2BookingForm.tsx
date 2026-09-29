"use client";

import BookingRequestForm from "@/app/components/BookingRequestForm";
import { buildV2BookHref, V2_BROWSE_HREF } from "@/lib/v2/ui-version";

type V2BookingFormProps = {
  spaceId: string;
  ownerId?: string | null;
  bookingUnit: string | null;
  priceAmount?: number | null;
  priceUnit?: string | null;
  pricePerHour: number | null;
  pricePerDay: number | null;
  pricePerMonth: number | null;
  minHours?: number | null;
  minDays?: number | null;
  minMonths?: number | null;
  spaceLocation?: string;
};

export default function V2BookingForm(props: V2BookingFormProps) {
  return (
    <BookingRequestForm
      {...props}
      className="fms-v2-booking-engine"
      authReturnPath={buildV2BookHref(props.spaceId)}
      successBrowseHref={V2_BROWSE_HREF}
    />
  );
}
