"use client";

import dynamic from "next/dynamic";

const SpacesMap = dynamic(() => import("@/app/components/SpacesMap"), {
  ssr: false,
});

type Props = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  price_per_day: number | null;
  price_per_hour: number | null;
  price_per_month: number | null;
  space_type: string | null;
  booking_unit: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function SpaceMapSection(props: Props) {
  const mapSpaces = [
    {
      id: props.id,
      title: props.title,
      description: props.description,
      city: props.city,
      suburb: props.suburb,
      address_line_1: props.address_line_1,
      price_per_day: props.price_per_day,
      price_per_hour: props.price_per_hour,
      price_per_month: props.price_per_month,
      space_type: props.space_type,
      booking_unit: props.booking_unit,
      latitude: props.latitude,
      longitude: props.longitude,
    },
  ];

  return (
    <section className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-2xl font-semibold text-[#192a3a]">Location</h2>

      {props.latitude !== null && props.longitude !== null ? (
        <div className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-100">
          <div className="h-[320px] w-full">
            <SpacesMap spaces={mapSpaces} />
          </div>
        </div>
      ) : (
        <p className="text-gray-600">No map location available yet.</p>
      )}
    </section>
  );
}