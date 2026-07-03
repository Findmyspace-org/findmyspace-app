"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";
import { AdminPropertySpaceBreadcrumb } from "@/app/components/AdminPropertySpaceBreadcrumb";
import { useUnsavedBackFallback, useUnsavedGuardEnabled } from "@/app/components/UnsavedChangesProvider";
import { adminApiFetch } from "@/lib/admin-api-client";

export default function NewPropertySpacePage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = typeof params.id === "string" ? params.id : "";

  useUnsavedBackFallback(propertyId ? `/admin/properties/${propertyId}` : undefined);
  useUnsavedGuardEnabled(true);

  const [loading, setLoading] = useState(true);
  const [propertyName, setPropertyName] = useState("");
  const [initialLocation, setInitialLocation] = useState<{
    title?: string;
    city?: string;
    suburb?: string;
    streetAddress?: string;
    province?: string;
    postalCode?: string;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
  }>();

  const loadProperty = useCallback(async () => {
    if (!propertyId) return;
    try {
      const result = await adminApiFetch(`/api/admin/properties/${propertyId}`);
      const property = result.property as {
        name: string;
        city: string | null;
        suburb: string | null;
        address_line1: string | null;
        province: string | null;
        postal_code: string | null;
        country: string | null;
        latitude: number | null;
        longitude: number | null;
        crm_organisation: { id: string; name: string } | null;
      };
      setPropertyName(property.name);
      setInitialLocation({
        city: property.city ?? "",
        suburb: property.suburb ?? "",
        streetAddress: property.address_line1 ?? "",
        province: property.province ?? "",
        postalCode: property.postal_code ?? "",
        country: property.country ?? "South Africa",
        latitude: property.latitude,
        longitude: property.longitude,
      });
    } catch {
      setPropertyName("");
    }
  }, [propertyId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadProperty();
      setLoading(false);
    }
    void init();
  }, [loadProperty]);

  if (loading) {
    return <div className="text-gray-600">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPropertySpaceBreadcrumb
        propertyId={propertyId}
        propertyName={propertyName || "Property"}
      />

      <h1 className="text-2xl font-semibold text-gray-900">Add space</h1>
      <p className="mt-1 text-sm text-gray-600">
        Create a draft listing under {propertyName || "this property"}. Address is
        prefilled from the property.
      </p>

      <div className="mt-6">
        <AdminUnclaimedSpaceForm
          mode="create"
          wrapWithUnsavedGuard={false}
          propertyId={propertyId}
          initial={initialLocation}
          backHref={`/admin/properties/${propertyId}`}
          backLabel="Back to property"
          onCreated={(newSpaceId) => {
            router.replace(
              `/admin/spaces/${newSpaceId}/edit?returnTo=${encodeURIComponent(`/admin/properties/${propertyId}`)}&saved=1`
            );
          }}
          onSavedAndExit={() => {
            router.push(`/admin/properties/${propertyId}?saved=1`);
          }}
        />
      </div>
    </div>
  );
}
