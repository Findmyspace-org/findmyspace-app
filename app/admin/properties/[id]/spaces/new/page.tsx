"use client";

import { hasAdminUiAccess } from "@/lib/client-admin-access";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AdminUnclaimedSpaceForm } from "@/app/components/AdminUnclaimedSpaceForm";
import { AdminPropertySpaceBreadcrumb } from "@/app/components/AdminPropertySpaceBreadcrumb";
import { adminApiFetch } from "@/lib/admin-api-client";

export default function NewPropertySpacePage() {
  const params = useParams();
  const propertyId = typeof params.id === "string" ? params.id : "";

  const [role, setRole] = useState<string | null>(null);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const r = (profile as { role?: string } | null)?.role ?? null;
      setRole(r);
      if (hasAdminUiAccess(r)) {
        await loadProperty();
      }
      setLoading(false);
    }
    void init();
  }, [loadProperty]);

  if (loading) {
    return <div className="text-gray-600">Loading…</div>;
  }

  if (!hasAdminUiAccess(role)) {
    return (
      <div>
        <p className="text-red-600">Access denied.</p>
      </div>
    );
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
          propertyId={propertyId}
          initial={initialLocation}
          backHref={`/admin/properties/${propertyId}`}
          backLabel="Back to property"
          onCreated={(newSpaceId) => {
            window.history.replaceState(
              null,
              "",
              `/admin/properties/${propertyId}/spaces/${newSpaceId}/edit`
            );
          }}
        />
      </div>
    </div>
  );
}
