"use client";

import dynamic from "next/dynamic";

const SpacesMap = dynamic(() => import("@/app/components/SpacesMap"), {
  ssr: false,
});

type V2SpaceLocationMapProps = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  price_amount: number | null;
  price_unit: string | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  booking_unit: string | null;
  space_type: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function V2SpaceLocationMap(
  props: V2SpaceLocationMapProps
) {
  if (props.latitude === null || props.longitude === null) return null;

  return (
    <div className="fms-v2-detail-map">
      <SpacesMap spaces={[props]} />
    </div>
  );
}
