"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  AdminCrmOrganisationPicker,
  type CrmOrganisationOption,
} from "@/app/components/AdminCrmOrganisationPicker";
import {
  AdminLocationSection,
  type AdminLocationValue,
} from "@/app/components/AdminLocationSection";
import { AdminPropertyBrandingSection } from "@/app/components/AdminPropertyLogo";
import { applyCrmOrgToPropertyFields } from "@/lib/property-crm-prefill";
import { FormSaveStateIndicator } from "@/app/components/FormSaveStateIndicator";
import {
  UnsavedChangesProvider,
  useRegisterUnsavedSection,
} from "@/app/components/UnsavedChangesProvider";
import { useFormSaveState } from "@/lib/use-form-save-state";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

export type AdminPropertyFormValues = {
  name: string;
  description: string;
  ownerEmail: string;
  crmOrganisationId: string | null;
  crmOrganisationName: string | null;
  location: AdminLocationValue;
};

type Props = {
  mode: "create" | "edit";
  propertyId?: string;
  initial: AdminPropertyFormValues;
  logoUrl?: string | null;
  onLogoChange?: (logoUrl: string | null) => void;
  defaultOrganisationId?: string;
  defaultOrganisationName?: string;
  submitLabel?: string;
  onSuccess: (propertyId: string) => void;
  onCancel?: () => void;
  /** When false, parent wraps the page with UnsavedChangesProvider. */
  wrapWithUnsavedGuard?: boolean;
};

function serializePropertyFormValues(values: AdminPropertyFormValues): string {
  return JSON.stringify({
    name: values.name,
    description: values.description,
    ownerEmail: values.ownerEmail,
    crmOrganisationId: values.crmOrganisationId,
    crmOrganisationName: values.crmOrganisationName,
    location: values.location,
  });
}

function propertyValuesFromState(input: {
  name: string;
  description: string;
  ownerEmail: string;
  crmOrganisationId: string | null;
  crmOrganisationName: string | null;
  location: AdminLocationValue;
}): AdminPropertyFormValues {
  return {
    name: input.name,
    description: input.description,
    ownerEmail: input.ownerEmail,
    crmOrganisationId: input.crmOrganisationId,
    crmOrganisationName: input.crmOrganisationName,
    location: input.location,
  };
}

export function AdminPropertyForm(props: Props) {
  if (props.wrapWithUnsavedGuard === false) {
    return <AdminPropertyFormInner {...props} />;
  }

  return (
    <UnsavedChangesProvider
      enabled={props.mode === "edit"}
      backFallbackHref={
        props.mode === "edit" && props.propertyId
          ? `/admin/properties/${props.propertyId}`
          : "/admin/properties"
      }
    >
      <AdminPropertyFormInner {...props} />
    </UnsavedChangesProvider>
  );
}

function AdminPropertyFormInner({
  mode,
  propertyId,
  initial,
  logoUrl = null,
  onLogoChange,
  defaultOrganisationId,
  defaultOrganisationName,
  submitLabel,
  onSuccess,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [ownerEmail, setOwnerEmail] = useState(initial.ownerEmail);
  const [crmOrganisationId, setCrmOrganisationId] = useState<string | null>(
    initial.crmOrganisationId
  );
  const [crmOrganisationName, setCrmOrganisationName] = useState<string | null>(
    initial.crmOrganisationName
  );
  const [location, setLocation] = useState<AdminLocationValue>(initial.location);
  const [message, setMessage] = useState<string | null>(null);
  const [createSaving, setCreateSaving] = useState(false);

  const serverSyncKey = useMemo(
    () =>
      mode === "edit" && propertyId
        ? `edit:${propertyId}:${serializePropertyFormValues(initial)}`
        : `create:${defaultOrganisationId ?? ""}`,
    [mode, propertyId, initial, defaultOrganisationId]
  );

  const currentValues = useMemo(
    () =>
      propertyValuesFromState({
        name,
        description,
        ownerEmail,
        crmOrganisationId,
        crmOrganisationName,
        location,
      }),
    [name, description, ownerEmail, crmOrganisationId, crmOrganisationName, location]
  );

  const {
    isDirty,
    isSaving,
    saveError,
    lastSavedAt,
    beginSave,
    finishSave,
    clearSaveError,
    markSaved,
  } = useFormSaveState({
    serialize: serializePropertyFormValues,
    current: currentValues,
    enabled: mode === "edit",
  });

  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    const nextValues = { ...initialRef.current };
    setName(nextValues.name);
    setDescription(nextValues.description);
    setOwnerEmail(nextValues.ownerEmail);
    setCrmOrganisationId(nextValues.crmOrganisationId);
    setCrmOrganisationName(nextValues.crmOrganisationName);
    setLocation(nextValues.location);
    markSaved(nextValues);
    setMessage(null);
    clearSaveError();
  }, [serverSyncKey, markSaved, clearSaveError]);

  const applyOrgPrefill = useCallback((org: CrmOrganisationOption) => {
    setName((currentName) => {
      if (!currentName.trim()) return org.name;
      return currentName;
    });
    setLocation((currentLocation) => {
      const prefill = applyCrmOrgToPropertyFields(org, {
        name: "",
        location: currentLocation,
      });
      return prefill.location
        ? { ...currentLocation, ...prefill.location }
        : currentLocation;
    });
  }, []);

  const handleCrmOrgChange = useCallback(
    (org: CrmOrganisationOption | null) => {
      if (!org) {
        setCrmOrganisationId(null);
        setCrmOrganisationName(null);
        return;
      }

      setCrmOrganisationId(org.id);
      setCrmOrganisationName(org.name);
      applyOrgPrefill(org);
    },
    [applyOrgPrefill]
  );

  const initialPrefillDone = useRef(false);
  useEffect(() => {
    if (mode === "edit") return;
    const orgId = initial.crmOrganisationId || defaultOrganisationId;
    if (!orgId || initialPrefillDone.current) return;

    let cancelled = false;
    async function loadLinkedOrg() {
      try {
        const result = await adminApiFetch(
          `/api/admin/crm/organisations/search?id=${encodeURIComponent(orgId!)}`
        );
        const orgs = (result.organisations as CrmOrganisationOption[]) || [];
        const org = orgs.find((row) => row.id === orgId) ?? orgs[0];
        if (cancelled || !org) return;

        initialPrefillDone.current = true;
        setCrmOrganisationId(org.id);
        setCrmOrganisationName(org.name);
        applyOrgPrefill(org);
      } catch {
        if (
          !cancelled &&
          defaultOrganisationId &&
          defaultOrganisationName &&
          orgId === defaultOrganisationId
        ) {
          initialPrefillDone.current = true;
          setCrmOrganisationId(defaultOrganisationId);
          setCrmOrganisationName(defaultOrganisationName);
          applyOrgPrefill({
            id: defaultOrganisationId,
            name: defaultOrganisationName,
          });
        }
      }
    }

    void loadLinkedOrg();
    return () => {
      cancelled = true;
    };
  }, [
    applyOrgPrefill,
    defaultOrganisationId,
    defaultOrganisationName,
    initial.crmOrganisationId,
    mode,
  ]);

  const saveProperty = useCallback(async (): Promise<boolean> => {
    if (mode === "edit") {
      beginSave();
      clearSaveError();
    } else {
      setCreateSaving(true);
    }
    setMessage(null);

    const body = {
      name,
      description,
      owner_email: ownerEmail || null,
      crm_organisation_id: crmOrganisationId,
      address_line1: location.streetAddress || null,
      suburb: location.suburb || null,
      city: location.city || null,
      province: location.province || null,
      postal_code: location.postalCode || null,
      country: location.country || null,
      latitude: location.latitude,
      longitude: location.longitude,
    };

    try {
      if (mode === "create") {
        const result = await adminApiFetch("/api/admin/properties", {
          method: "POST",
          body: JSON.stringify(body),
        });
        onSuccess((result.property as { id: string }).id);
        return true;
      }
      if (propertyId) {
        await adminApiFetch(`/api/admin/properties/${propertyId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        finishSave({ ok: true, value: currentValues });
        onSuccess(propertyId);
        return true;
      }
      finishSave({ ok: false, error: "Missing property id." });
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Could not save property.";
      setMessage(errorMessage);
      if (mode === "edit") {
        finishSave({ ok: false, error: errorMessage });
      } else {
        finishSave({ ok: false, error: errorMessage });
      }
      return false;
    } finally {
      if (mode === "create") {
        setCreateSaving(false);
      }
    }
  }, [
    beginSave,
    clearSaveError,
    crmOrganisationId,
    currentValues,
    description,
    finishSave,
    location,
    mode,
    name,
    onSuccess,
    ownerEmail,
    propertyId,
  ]);

  useRegisterUnsavedSection("admin-property-details", {
    label: "Property details",
    isDirty: mode === "edit" && isDirty,
    save: mode === "edit" ? saveProperty : undefined,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await saveProperty();
  }

  const saveDisabled =
    !name.trim() || (mode === "edit" ? isSaving : createSaving) || (mode === "edit" && !isDirty);

  const showSaving = mode === "edit" ? isSaving : createSaving;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {mode === "edit" && propertyId && onLogoChange ? (
        <AdminPropertyBrandingSection
          propertyId={propertyId}
          logoUrl={logoUrl}
          onLogoChange={onLogoChange}
          onMessage={setMessage}
        />
      ) : null}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Property name *
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD_CLASS}
            placeholder="e.g. Paarl Boys High"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={FIELD_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Owner email (optional)
          </span>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className={FIELD_CLASS}
            placeholder="owner@example.com"
          />
        </label>

        <AdminCrmOrganisationPicker
          value={crmOrganisationId}
          organisationName={crmOrganisationName}
          onChange={handleCrmOrgChange}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Address</h2>
        <div className="mt-4">
          <AdminLocationSection
            value={location}
            onChange={(patch) => setLocation((prev) => ({ ...prev, ...patch }))}
          />
        </div>
      </div>

      {message && mode === "create" ? (
        <p className="text-sm text-red-600">{message}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {mode === "edit" ? (
          <FormSaveStateIndicator
            isDirty={isDirty}
            isSaving={isSaving}
            saveError={saveError || message}
            lastSavedAt={lastSavedAt}
          />
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saveDisabled}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {showSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {showSaving
              ? "Saving…"
              : submitLabel || (mode === "create" ? "Create property" : "Save changes")}
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={showSaving}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {mode === "edit" && saveError ? (
        <p role="alert" className="text-sm text-red-700">
          {saveError}
        </p>
      ) : null}
    </form>
  );
}
