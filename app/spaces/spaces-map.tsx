"use client";

import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

type Space = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  suburb: string | null;
  price_per_day: number | null;
  space_type: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function SpacesMap({ spaces }: { spaces: Space[] }) {
  const firstSpace = spaces[0];

  const center: [number, number] =
    firstSpace?.latitude && firstSpace?.longitude
      ? [Number(firstSpace.latitude), Number(firstSpace.longitude)]
      : [-33.7342, 18.9621];

  return (
    <div className="h-[500px] overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {spaces.map((space) => {
          if (space.latitude === null || space.longitude === null) return null;

          return (
            <Marker
              key={space.id}
              position={[Number(space.latitude), Number(space.longitude)]}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{space.title}</div>
                  <div>{space.space_type || "No type"}</div>
                  <div>{space.city || "No city"}</div>
                  <div>
                    {space.price_per_day ? `R${space.price_per_day} / day` : "Price not set"}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}