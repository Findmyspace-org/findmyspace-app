import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { V2Container } from "@/app/components/v2/V2Primitives";
import { V2_BROWSE_HREF } from "@/lib/v2/ui-version";

export default function V2SpaceNotFound() {
  return (
    <V2Container>
      <div className="fms-v2-detail-not-found">
        <MapPinOff aria-hidden />
        <h1>This space isn&apos;t available</h1>
        <p>
          It may no longer be public, or the listing may still be under review.
        </p>
        <Link href={V2_BROWSE_HREF}>Browse available spaces</Link>
      </div>
    </V2Container>
  );
}
