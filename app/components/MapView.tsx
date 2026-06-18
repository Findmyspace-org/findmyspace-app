"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });

import "leaflet/dist/leaflet.css";

import { MapPin, Tag, Wallet, CalendarDays, FileText } from "lucide-react";
import { stripMarkdownForExcerpt } from "@/lib/markdown-description";
import { formatSpacePriceDisplay } from "@/lib/space-pricing";

type Space = {
  id: string;
  title: string;
  description?: string | null;
  city?: string | null;
  suburb?: string | null;
  address_line_1?: string | null;
  space_type?: string | null;
  booking_unit?: string | null;
  price_amount?: number | null;
  price_unit?: string | null;
  price_per_hour?: number | null;
  price_per_day?: number | null;
  price_per_month?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  spaces: Space[];
};

type MapGroup = {
  id: string;
  latitude: number;
  longitude: number;
  spaces: Space[];
};

let L: any = null;

function FitBounds({ groups }: { groups: MapGroup[] }) {
  if (typeof window === "undefined") return null;

  const { useMap } = require("react-leaflet");
  const map = useMap();

  useEffect(() => {
    if (!L || groups.length === 0) return;

    const bounds = L.latLngBounds(
      groups.map((group) => [group.latitude, group.longitude])
    );

    map.fitBounds(bounds, { padding: [40, 40] });
  }, [groups, map]);

  return null;
}

function formatBookingUnit(value?: string | null) {
  if (value === "hour") return "hour";
  if (value === "month") return "month";
  return "day";
}

function getPriceLabel(space: Space) {
  return formatSpacePriceDisplay(space);
}

function getPrimaryAddress(space: Space) {
  return space.address_line_1 || "No address";
}

function getSecondaryAddress(space: Space) {
  return [space.suburb, space.city].filter(Boolean).join(", ") || "Location not set";
}

function clusterSpaces(spaces: Space[]) {
  const validSpaces = spaces.filter(
    (space) => typeof space.latitude === "number" && typeof space.longitude === "number"
  ) as Array<Space & { latitude: number; longitude: number }>;

  const groups: MapGroup[] = [];
  const threshold = 0.008;

  validSpaces.forEach((space) => {
    const existingGroup = groups.find((group) => {
      return (
        Math.abs(group.latitude - space.latitude) < threshold &&
        Math.abs(group.longitude - space.longitude) < threshold
      );
    });

    if (!existingGroup) {
      groups.push({
        id: space.id,
        latitude: space.latitude,
        longitude: space.longitude,
        spaces: [space],
      });
      return;
    }

    existingGroup.spaces.push(space);

    const total = existingGroup.spaces.length;
    existingGroup.latitude =
      existingGroup.spaces.reduce((sum, item) => sum + (item.latitude || 0), 0) / total;
    existingGroup.longitude =
      existingGroup.spaces.reduce((sum, item) => sum + (item.longitude || 0), 0) / total;
    existingGroup.id = existingGroup.spaces.map((item) => item.id).join("-");
  });

  return groups;
}

export default function MapView({ spaces }: Props) {
  const [leafletReady, setLeafletReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((leaflet) => {
      L = leaflet;

      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      setLeafletReady(true);
    });
  }, []);

  const groups = useMemo(() => clusterSpaces(spaces), [spaces]);

  const singlePinIcon = useMemo(() => {
    if (!L || !leafletReady) return undefined;

    return L.divIcon({
      className: "fms-map-pin-icon",
      html: `
        <div style="
          width:46px;
          height:58px;
          display:flex;
          align-items:flex-end;
          justify-content:center;
          pointer-events:none;
        ">
          <div
            style="
              width:46px;
              height:58px;
              background-image:url('/map-pin.png');
              background-repeat:no-repeat;
              background-position:center bottom;
              background-size:contain;
            "
          ></div>
        </div>
      `,
      iconSize: [46, 58],
      iconAnchor: [23, 58],
      popupAnchor: [0, -46],
    });
  }, [leafletReady]);

  const getClusterIcon = (count: number) => {
    if (!L || !leafletReady) return undefined;

    return L.divIcon({
      className: "fms-map-cluster-icon",
      html: `
        <div style="
          width:42px;
          height:42px;
          border-radius:9999px;
          background:#192a3a;
          color:#ffffff;
          border:3px solid #ffffff;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:700;
          font-size:14px;
          box-shadow:0 6px 18px rgba(15,23,42,0.18);
        ">${count}</div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      popupAnchor: [0, -18],
    });
  };

  if (!leafletReady) {
    return (
      <div className="flex h-[500px] w-full items-center justify-center text-gray-500">
        Loading map...
      </div>
    );
  }

  return (
    <MapContainer
      center={[-33.9249, 18.4241]}
      zoom={10}
      scrollWheelZoom={true}
      className="h-[500px] w-full rounded-lg"
      style={{ zIndex: 1 }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds groups={groups} />

      {groups.map((group) => {
        const isCluster = group.spaces.length > 1;
        const firstSpace = group.spaces[0];

        return (
          <Marker
            key={group.id}
            position={[group.latitude, group.longitude]}
            icon={
              isCluster
                ? getClusterIcon(group.spaces.length) || undefined
                : singlePinIcon || undefined
            }
          >
            <Popup minWidth={280}>
              {isCluster ? (
                <div className="space-y-4 text-sm text-[#192a3a]">
                  <div>
                    <h3 className="text-xl font-semibold leading-tight">
                      {group.spaces.length} spaces in this area
                    </h3>
                    <p className="mt-1 text-gray-500">Select a listing below</p>
                  </div>

                  <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
                    {group.spaces.map((space) => (
                      <div key={space.id} className="rounded-md border border-gray-200 p-3">
                        <div className="text-base font-semibold text-[#192a3a]">{space.title}</div>
                        <div className="mt-1 text-sm text-gray-600">{getSecondaryAddress(space)}</div>
                        <div className="mt-2 text-sm font-medium text-[#192a3a]">{getPriceLabel(space)}</div>
                        <a
                          href={`/spaces/${space.id}`}
                          className="mt-3 inline-flex rounded-md bg-[#192a3a] px-3 py-2 font-medium text-white transition hover:opacity-95"
                        >
                          View listing
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-sm text-[#192a3a]">
                  <div>
                    <h3 className="text-2xl font-semibold leading-tight">{firstSpace.title}</h3>
                  </div>

                  <div className="space-y-2 text-gray-700">
                    <div className="flex items-start gap-2">
                      <Tag className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <span className="capitalize">{firstSpace.space_type || "Space"}</span>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <span>{getPrimaryAddress(firstSpace)}</span>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <span>{getSecondaryAddress(firstSpace)}</span>
                    </div>

                    <div className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <span>By {formatBookingUnit(firstSpace.booking_unit)}</span>
                    </div>

                    <div className="flex items-start gap-2 font-semibold text-[#192a3a]">
                      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                      <span>{getPriceLabel(firstSpace)}</span>
                    </div>

                    {firstSpace.description ? (
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                        <span>{stripMarkdownForExcerpt(firstSpace.description, 220)}</span>
                      </div>
                    ) : null}
                  </div>

                  <a
                    href={`/spaces/${firstSpace.id}`}
                    className="inline-flex rounded-md bg-[#192a3a] px-4 py-2 font-medium text-white transition hover:opacity-95"
                  >
                    View listing
                  </a>
                </div>
              )}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}