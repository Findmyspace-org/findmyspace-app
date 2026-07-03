"use client";

import { useParams } from "next/navigation";
import { AdminSpaceEditPage } from "@/app/components/admin/AdminSpaceEditPage";

export default function EditPropertySpacePage() {
  const params = useParams();
  const propertyId = typeof params.id === "string" ? params.id : "";
  const spaceId = typeof params.spaceId === "string" ? params.spaceId : "";

  return (
    <AdminSpaceEditPage spaceId={spaceId} propertyIdConstraint={propertyId || undefined} />
  );
}
