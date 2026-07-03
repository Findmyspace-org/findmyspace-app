"use client";

import { useParams } from "next/navigation";
import { AdminSpaceEditPage } from "@/app/components/admin/AdminSpaceEditPage";

export default function EditUnclaimedListingPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  return <AdminSpaceEditPage spaceId={id} />;
}
