import Image from "next/image";

export const V2_LOGO_SRC = "/logo.png" as const;
export const V2_MAP_MARKER_SRC = "/map-pin.png" as const;

export function V2Logo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={V2_LOGO_SRC}
      alt="FindMySpace"
      width={200}
      height={56}
      priority={priority}
      className={className}
    />
  );
}

/**
 * Visual/reference wrapper for the official FindMySpace teardrop marker.
 * Future Leaflet adapters should import V2_MAP_MARKER_SRC rather than
 * introducing another marker asset.
 */
export function V2MapMarker({
  size = 44,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={V2_MAP_MARKER_SRC}
      alt="FindMySpace map marker"
      width={size}
      height={size}
      className={className}
    />
  );
}
