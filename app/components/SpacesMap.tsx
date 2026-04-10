"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import Link from "next/link";

type Space = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  address_line_1: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  price_per_month?: number | null;
  booking_unit?: string | null;
  space_type: string | null;
  latitude: number | null;
  longitude: number | null;
};

function FitBounds({ spaces }: { spaces: Space[] }) {
  const map = useMap();

  useEffect(() => {
    const validSpaces = spaces.filter(
      (space) => space.latitude !== null && space.longitude !== null
    );

    if (validSpaces.length === 0) return;

    if (validSpaces.length === 1) {
      map.setView(
        [Number(validSpaces[0].latitude), Number(validSpaces[0].longitude)],
        13
      );
      return;
    }

    const bounds = L.latLngBounds(
      validSpaces.map((space) => [
        Number(space.latitude),
        Number(space.longitude),
      ] as [number, number])
    );

    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, spaces]);

  return null;
}

const customPinIcon = L.icon({
  iconUrl: "/map-pin.png",
  iconSize: [42, 42],
  iconAnchor: [21, 42],
  popupAnchor: [0, -36],
});

export default function SpacesMap({ spaces }: { spaces: Space[] }) {
  const validSpaces = spaces.filter(
    (space) => space.latitude !== null && space.longitude !== null
  );

  const defaultCenter: [number, number] = [-33.7342, 18.9621];

  function getPriceLabel(space: Space) {
    if (space.booking_unit === "hour") {
      return space.price_per_hour ? `R${space.price_per_hour} / hour` : "Price not set";
    }

    if (space.booking_unit === "month") {
      return space.price_per_month
        ? `R${space.price_per_month} / month`
        : "Price not set";
    }

    return space.price_per_day ? `R${space.price_per_day} / day` : "Price not set";
  }

  return (
    <div className="relative z-0 h-[600px] w-full overflow-hidden rounded-md">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        className="h-full w-full"
        style={{ zIndex: 0 }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds spaces={validSpaces} />

        {validSpaces.map((space) => (
          <Marker
            key={space.id}
            position={[Number(space.latitude), Number(space.longitude)]}
            icon={customPinIcon}
          >
            <Popup>
              <div className="min-w-[180px] text-sm">
                <div className="mb-1 font-semibold">{space.title}</div>

                <div className="text-gray-600">
                  {space.space_type || "No type"}
                </div>

                <div className="text-gray-600">
                  {space.address_line_1 || "No address"}
                </div>

                <div className="mb-2 text-gray-600">
                  {[space.suburb, space.city].filter(Boolean).join(", ") || "No city"}
                </div>

                <div className="mb-3 font-medium">{getPriceLabel(space)}</div>

                <Link
                  href={`/spaces/${space.id}`}
                  className="inline-block rounded-md bg-[#192a3a] px-3 py-2 text-xs text-white"
                >
                  View listing
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}