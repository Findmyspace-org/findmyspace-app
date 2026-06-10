"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Marker as LeafletMarker } from "leaflet";

type MapPickerProps = {
  latitude: number;
  longitude: number;
  zoom?: number;
  onChange: (lat: number, lng: number) => void;
};

function ClickHandler({
  onChange,
}: {
  onChange: (lat: number, lng: number) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useMapEvents({
    click(e) {
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}

function RecenterMap({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
  }, [latitude, longitude, map]);

  return null;
}

/** Keeps marker position in sync when parent coordinates change (click / form update). */
function DraggableMarker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const current = marker.getLatLng();
    if (
      Math.abs(current.lat - latitude) > 1e-7 ||
      Math.abs(current.lng - longitude) > 1e-7
    ) {
      marker.setLatLng([latitude, longitude]);
    }
  }, [latitude, longitude]);

  return (
    <Marker
      ref={markerRef}
      position={[latitude, longitude]}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng();
          onChangeRef.current(pos.lat, pos.lng);
        },
      }}
    />
  );
}

export default function MapPicker({
  latitude,
  longitude,
  zoom = 13,
  onChange,
}: MapPickerProps) {
  useEffect(() => {
    const L = require("leaflet");

    delete L.Icon.Default.prototype._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-300">
      <MapContainer
        center={[latitude, longitude]}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-[320px] w-full"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap latitude={latitude} longitude={longitude} />
        <ClickHandler onChange={onChange} />
        <DraggableMarker
          latitude={latitude}
          longitude={longitude}
          onChange={onChange}
        />
      </MapContainer>
    </div>
  );
}
