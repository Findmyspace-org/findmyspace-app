"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import SpaceCategoryFields from "@/app/components/SpaceCategoryFields";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { adminApiFetch } from "@/lib/admin-api-client";
import { AdminCrmLinkSection } from "@/app/components/AdminCrmLinkSection";
import { AdminLocationSection } from "@/app/components/AdminLocationSection";
import {
  AdminSpacePhotosPanel,
  type AdminSpaceImage,
} from "@/app/components/AdminSpacePhotosPanel";
import { SpaceAiInformationPanel } from "@/app/components/SpaceAiInformationPanel";
import { SpaceBookingRequirementsSection } from "@/app/components/SpaceBookingRequirementsSection";
import { SectionInlineAlert } from "@/app/components/SectionInlineAlert";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { MIN_PUBLIC_PHOTOS_ERROR } from "@/lib/space-image-persistence";
import { useSectionFeedback } from "@/lib/use-section-feedback";
import {
  GroupSizeFields,
  groupSizePayloadFromForm,
  validateGroupSizeFormValues,
} from "@/app/components/GroupSizeFields";
import {
  SpacePricingPeriodSection,
  validateSpacePricingPeriodFormFields,
} from "@/app/components/SpacePricingPeriodSection";
import {
  spacePricingPayloadFromForm,
  validateSpacePricingFormValues,
} from "@/app/components/SpacePricingFields";
import {
  minBookingPayloadFromForm,
  validateMinBookingFormValues,
  type MinBookingDurationUnit,
} from "@/lib/space-min-booking";
import MarkdownDescriptionEditor from "@/app/components/MarkdownDescriptionEditor";
import {
  UnsavedChangesProvider,
  UnsavedSectionIndicator,
  useRegisterUnsavedSection,
  useUnsavedChangesOptional,
} from "@/app/components/UnsavedChangesProvider";
import { FormSaveStateIndicator } from "@/app/components/FormSaveStateIndicator";
import { useFormSaveState } from "@/lib/use-form-save-state";

type FormState = {
  title: string;
  description: string;
  spaceType: string;
  bookingUnit: string;
  city: string;
  suburb: string;
  streetAddress: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  minGroupSize: string;
  maxGroupSize: string;
  priceAmount: string;
  priceUnit: string;
  depositRequired: boolean;
  depositAmount: string;
  minBookingDuration: string;
  minBookingUnit: MinBookingDurationUnit | "";
  attributes: Record<string, string[]>;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

type CrmLinkState = {
  crm_organisation_id: string | null;
  crm_contact_id: string | null;
};

function payloadFromState(state: FormState, crmLink: CrmLinkState) {
  const pricing = spacePricingPayloadFromForm(
    state.priceAmount,
    state.priceUnit,
    state.depositRequired,
    state.depositAmount
  );
  if (!pricing.ok) {
    throw new Error(pricing.error);
  }

  const minBooking = minBookingPayloadFromForm(
    state.minBookingDuration,
    state.minBookingUnit
  );
  if (!minBooking.ok) {
    throw new Error(minBooking.error);
  }

  return {
    title: state.title,
    description: state.description,
    space_type: state.spaceType,
    city: state.city,
    suburb: state.suburb,
    street_address: state.streetAddress,
    province: state.province,
    postal_code: state.postalCode,
    country: state.country,
    latitude: state.latitude,
    longitude: state.longitude,
    attributes: state.attributes,
    ...groupSizePayloadFromForm(state.spaceType, state.minGroupSize, state.maxGroupSize),
    ...pricing.data,
    ...minBooking.data,
    crm_organisation_id: crmLink.crm_organisation_id,
    crm_contact_id: crmLink.crm_contact_id,
  };
}

type AdminFormSnapshot = {
  state: FormState;
  crmLink: CrmLinkState;
};

function serializeAdminFormSnapshotValue(snapshot: AdminFormSnapshot) {
  return serializeAdminFormSnapshot(snapshot.state, snapshot.crmLink);
}

function serializeAdminFormSnapshot(state: FormState, crmLink: CrmLinkState) {
  try {
    return JSON.stringify(payloadFromState(state, crmLink));
  } catch {
    return "";
  }
}

async function fetchPersistedAdminSpaceImages(
  spaceId: string,
  propertyId?: string
): Promise<AdminSpaceImage[]> {
  const result = propertyId
    ? await adminApiFetch(`/api/admin/properties/${propertyId}/spaces/${spaceId}`)
    : await adminApiFetch(`/api/admin/spaces/${spaceId}/unclaimed`);
  return sortSpaceImages((result.images as AdminSpaceImage[]) || []);
}

function formStateFromInitial(initial?: Partial<FormState>): FormState {
  return {
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    spaceType: initial?.spaceType ?? "storage",
    bookingUnit: initial?.bookingUnit ?? "day",
    city: initial?.city ?? "",
    suburb: initial?.suburb ?? "",
    streetAddress: initial?.streetAddress ?? "",
    province: initial?.province ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "South Africa",
    latitude: initial?.latitude ?? null,
    longitude: initial?.longitude ?? null,
    minGroupSize: initial?.minGroupSize ?? "",
    maxGroupSize: initial?.maxGroupSize ?? "",
    priceAmount: initial?.priceAmount ?? "",
    priceUnit: initial?.priceUnit ?? "day",
    depositRequired: initial?.depositRequired ?? false,
    depositAmount: initial?.depositAmount ?? "",
    minBookingDuration: initial?.minBookingDuration ?? "",
    minBookingUnit: initial?.minBookingUnit ?? "",
    attributes: initial?.attributes ?? {},
  };
}

type AdminUnclaimedSpaceFormProps = {
  mode: "create" | "edit";
  spaceId?: string;
  initialStatus?: string | null;
  initial?: Partial<FormState>;
  initialImages?: AdminSpaceImage[];
  enquiryCount?: number;
  readOnly?: boolean;
  initialCrmLink?: SpaceCrmLinkSummary | null;
  defaultOrganisationId?: string;
  defaultOrganisationName?: string;
  defaultContactId?: string;
  defaultContactName?: string;
  /** When set, create mode POSTs to the property spaces API instead of standalone unclaimed. */
  propertyId?: string;
  backHref?: string;
  backLabel?: string;
  listHref?: string;
  listLabel?: string;
  onCreated?: (id: string) => void;
  onSavedAndExit?: () => void;
  /** When false, parent must wrap the page with UnsavedChangesProvider. */
  wrapWithUnsavedGuard?: boolean;
};

export function AdminUnclaimedSpaceForm({
  mode,
  spaceId,
  initialStatus,
  initial,
  initialImages = [],
  enquiryCount = 0,
  readOnly = false,
  initialCrmLink = null,
  defaultOrganisationId,
  defaultOrganisationName,
  defaultContactId,
  defaultContactName,
  propertyId,
  backHref,
  backLabel,
  listHref = "/admin/unclaimed-listings",
  listLabel = "All unclaimed listings",
  onCreated,
  onSavedAndExit,
  wrapWithUnsavedGuard = true,
}: AdminUnclaimedSpaceFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => formStateFromInitial(initial));
  const [images, setImages] = useState<AdminSpaceImage[]>(() =>
    sortSpaceImages(initialImages)
  );
  const [status, setStatus] = useState(initialStatus || "draft");
  const {
    status: saveStatus,
    error: saveError,
    setSuccess: setSaveSuccess,
    setFailure: setSaveFailure,
    clearForAction: clearSaveFeedback,
  } = useSectionFeedback();
  const [publishing, setPublishing] = useState(false);
  const [saveIntent, setSaveIntent] = useState<"continue" | "return" | null>(null);
  const [crmLink, setCrmLink] = useState<CrmLinkState>({
    crm_organisation_id:
      initialCrmLink?.crm_organisation_id ?? defaultOrganisationId ?? null,
    crm_contact_id: initialCrmLink?.crm_contact_id ?? defaultContactId ?? null,
  });
  /** After first save in create mode — enables photo upload before parent redirect. */
  const [createdSpaceId, setCreatedSpaceId] = useState<string | null>(null);
  const localImagesTouchedRef = useRef(false);
  const lastImagesSpaceKeyRef = useRef<string | null>(null);

  const activeSpaceId = spaceId ?? createdSpaceId;
  const activeMode = mode === "create" && createdSpaceId ? "edit" : mode;
  const imagesSpaceKey = activeSpaceId ?? "none";

  const resolvedBackHref =
    backHref ??
    (propertyId
      ? `/admin/properties/${propertyId}`
      : activeSpaceId
        ? "/admin/unclaimed-listings"
        : listHref);

  const appendSavedQuery = useCallback((href: string) => {
    const [path, query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    params.set("saved", "1");
    const next = params.toString();
    return next ? `${path}?${next}` : `${path}?saved=1`;
  }, []);

  const navigateAfterSave = useCallback(
    (returnToProperty: boolean) => {
      if (!returnToProperty) return;

      if (propertyId) {
        window.location.assign(appendSavedQuery(resolvedBackHref));
        return;
      }

      if (onSavedAndExit) {
        onSavedAndExit();
        return;
      }

      window.location.assign(appendSavedQuery(listHref));
    },
    [appendSavedQuery, listHref, onSavedAndExit, propertyId, resolvedBackHref]
  );

  useEffect(() => {
    if (lastImagesSpaceKeyRef.current === imagesSpaceKey) return;
    lastImagesSpaceKeyRef.current = imagesSpaceKey;
    localImagesTouchedRef.current = false;
  }, [imagesSpaceKey]);

  const handleImagesChange = useCallback((next: AdminSpaceImage[]) => {
    localImagesTouchedRef.current = true;
    setImages(next);
  }, []);

  const serverSyncKey = mode === "edit" && spaceId ? `edit:${spaceId}` : "create";
  const lastServerSyncKeyRef = useRef<string | null>(null);

  const formSnapshot = useMemo(
    () => ({ state, crmLink }),
    [state, crmLink]
  );

  const {
    isDirty: isMainFormDirty,
    isSaving: formIsSaving,
    saveError: formSaveError,
    lastSavedAt,
    beginSave,
    finishSave,
    clearSaveError,
    markSaved,
  } = useFormSaveState({
    serialize: serializeAdminFormSnapshotValue,
    current: formSnapshot,
    enabled: !readOnly,
  });

  const saving = formIsSaving;
  const savingReturn = saving && saveIntent === "return";
  const savingContinue = saving && saveIntent === "continue";

  const initialImagesKey = useMemo(
    () => initialImages.map((img) => img.id).join(","),
    [initialImages]
  );

  useEffect(() => {
    if (lastServerSyncKeyRef.current === serverSyncKey) return;
    lastServerSyncKeyRef.current = serverSyncKey;

    const baselineCrm = {
      crm_organisation_id:
        initialCrmLink?.crm_organisation_id ?? defaultOrganisationId ?? null,
      crm_contact_id: initialCrmLink?.crm_contact_id ?? defaultContactId ?? null,
    };

    const nextState = formStateFromInitial(initial);
    setState(nextState);
    markSaved({
      state: nextState,
      crmLink: baselineCrm,
    });

    if (mode === "edit" && spaceId && !localImagesTouchedRef.current) {
      setImages(sortSpaceImages(initialImages));
      setStatus(initialStatus || "draft");
    }
  }, [
    serverSyncKey,
    mode,
    spaceId,
    initial,
    initialImages,
    initialStatus,
    initialImagesKey,
    initialCrmLink,
    defaultOrganisationId,
    defaultContactId,
    markSaved,
  ]);

  const handleSave = useCallback(
    async ({ returnToProperty }: { returnToProperty: boolean }): Promise<boolean> => {
      if (readOnly) return true;
      beginSave();
      setSaveIntent(returnToProperty ? "return" : "continue");
      clearSaveFeedback();
      clearSaveError();
      try {
        const groupSizeErr = validateGroupSizeFormValues(
          state.spaceType,
          state.minGroupSize,
          state.maxGroupSize
        );
        if (groupSizeErr) {
          setSaveFailure(groupSizeErr);
          finishSave({ ok: false, error: groupSizeErr });
          return false;
        }

        const pricingErr = validateSpacePricingFormValues(
          state.priceAmount,
          state.priceUnit,
          state.depositRequired,
          state.depositAmount
        );
        if (pricingErr) {
          setSaveFailure(pricingErr);
          finishSave({ ok: false, error: pricingErr });
          return false;
        }

        const minBookingErr = validateMinBookingFormValues(
          state.minBookingDuration,
          state.minBookingUnit
        );
        if (minBookingErr) {
          setSaveFailure(minBookingErr);
          finishSave({ ok: false, error: minBookingErr });
          return false;
        }

        const periodErr = validateSpacePricingPeriodFormFields({
          bookingUnit: state.bookingUnit,
          priceUnit: state.priceUnit,
          minBookingUnit: state.minBookingUnit,
          minBookingDuration: state.minBookingDuration,
        });
        if (periodErr) {
          setSaveFailure(periodErr);
          finishSave({ ok: false, error: periodErr });
          return false;
        }

        const body = payloadFromState(state, crmLink);

        if (mode === "create") {
          if (propertyId && !propertyId.match(/^[0-9a-f-]{36}$/i)) {
            throw new Error("Invalid property context. Reload and try again.");
          }
          const result = propertyId
            ? await adminApiFetch(`/api/admin/properties/${propertyId}/spaces`, {
                method: "POST",
                body: JSON.stringify(body),
              })
            : await adminApiFetch("/api/admin/spaces/unclaimed", {
                method: "POST",
                body: JSON.stringify(body),
              });
          setStatus("draft");
          const newId = propertyId
            ? ((result.space as { id?: string })?.id as string)
            : (result.id as string);
          if (!newId) {
            throw new Error("Draft saved but listing id was missing. Please reload.");
          }
          setCreatedSpaceId(newId);

          if (propertyId) {
            finishSave({ ok: true, value: formSnapshot });
            if (returnToProperty) {
              navigateAfterSave(true);
            } else {
              router.replace(
                `/admin/properties/${propertyId}/spaces/${newId}/edit?saved=1`
              );
              onCreated?.(newId);
            }
          } else if (returnToProperty) {
            finishSave({ ok: true, value: formSnapshot });
            navigateAfterSave(true);
          } else {
            setSaveSuccess(
              "Draft saved. You can upload photos and AI Information below."
            );
            onCreated?.(newId);
            finishSave({ ok: true, value: formSnapshot });
          }
        } else if (activeSpaceId) {
          const patchUrl = propertyId
            ? `/api/admin/properties/${propertyId}/spaces/${activeSpaceId}`
            : `/api/admin/spaces/${activeSpaceId}/unclaimed`;
          await adminApiFetch(patchUrl, {
            method: "PATCH",
            body: JSON.stringify(
              status === "draft" ? { ...body, status: "draft" as const } : body
            ),
          });
          finishSave({ ok: true, value: formSnapshot });
          if (returnToProperty) {
            navigateAfterSave(true);
          } else {
            setSaveSuccess("Saved successfully.");
          }
        }

        return true;
      } catch (err) {
        console.error("Space save failed:", err);
        const errorMessage = err instanceof Error ? err.message : "Save failed.";
        setSaveFailure(errorMessage);
        finishSave({ ok: false, error: errorMessage });
        return false;
      } finally {
        setSaveIntent(null);
      }
    },
    [
      activeSpaceId,
      beginSave,
      clearSaveError,
      clearSaveFeedback,
      crmLink,
      finishSave,
      formSnapshot,
      mode,
      navigateAfterSave,
      onCreated,
      propertyId,
      readOnly,
      router,
      setSaveFailure,
      setSaveSuccess,
      state,
      status,
    ]
  );

  const publish = useCallback(async () => {
    if (readOnly) return;
    if (!activeSpaceId) {
      setSaveFailure("Save as draft first, then add photos and publish.");
      return;
    }
    if (
      state.latitude === null ||
      state.longitude === null ||
      !Number.isFinite(state.latitude) ||
      !Number.isFinite(state.longitude)
    ) {
      setSaveFailure(
        "This listing does not have a map pin yet. Find the address on the map or place the pin manually before publishing."
      );
      return;
    }
    setPublishing(true);
    clearSaveFeedback();
    try {
      const persistedImages = await fetchPersistedAdminSpaceImages(
        activeSpaceId,
        propertyId
      );
      setImages(persistedImages);
      if (persistedImages.length < 1) {
        setSaveFailure(MIN_PUBLIC_PHOTOS_ERROR);
        return;
      }

      await adminApiFetch(`/api/admin/spaces/${activeSpaceId}/unclaimed`, {
        method: "PATCH",
        body: JSON.stringify(payloadFromState(state, crmLink)),
      });
      await adminApiFetch(`/api/admin/spaces/${activeSpaceId}/publish-unclaimed`, {
        method: "POST",
      });
      setStatus("unclaimed");
      setSaveSuccess("Published as unclaimed. It is now visible publicly (not bookable).");
    } catch (err) {
      console.error("Publish failed:", err);
      setSaveFailure(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }, [
    activeSpaceId,
    clearSaveFeedback,
    crmLink,
    propertyId,
    readOnly,
    setSaveFailure,
    setSaveSuccess,
    state,
  ]);

  const statusBadge =
    status === "unclaimed"
      ? "bg-amber-100 text-amber-900"
      : status === "owner_claimed"
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-700";

  const resolvedBackLabel =
    backLabel ?? (propertyId ? "Back to property" : "Back to unclaimed listings");

  const formContent = (
    <>
      <AdminSpaceDetailsDirtyRegistration
        isDirty={isMainFormDirty}
        readOnly={readOnly}
        handleSave={handleSave}
      />
    <div className="space-y-6 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge}`}>
          {status === "unclaimed"
            ? "Unclaimed"
            : status === "owner_claimed"
              ? "Owner claimed"
              : "Draft"}
        </span>
        {enquiryCount > 0 ? (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
            {enquiryCount} {enquiryCount === 1 ? "enquiry" : "enquiries"}
          </span>
        ) : null}
        <span className="text-xs text-gray-500">
          Set venue pricing below. Unclaimed listings may still show pricing as to be confirmed publicly until published.
        </span>
      </div>

      {readOnly ? (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          This listing has been claimed by an owner. Editing is disabled here — use
          admin spaces tools or wait for the owner verification flow.
        </p>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">
          Basics
          <UnsavedSectionIndicator show={isMainFormDirty} />
        </h2>
        <fieldset disabled={readOnly} className="mt-4 space-y-4 disabled:opacity-80">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Title</span>
            <input
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              className={FIELD_CLASS}
              placeholder="e.g. Warehouse in Paarl"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </span>
            <MarkdownDescriptionEditor
              value={state.description}
              onChange={(description) => setState((s) => ({ ...s, description }))}
              rows={5}
              disabled={readOnly}
              textareaClassName="w-full px-3 py-2 text-sm outline-none"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Category
              </span>
              <select
                value={state.spaceType}
                onChange={(e) => setState((s) => ({ ...s, spaceType: e.target.value }))}
                className={FIELD_CLASS}
              >
                {LISTING_SPACE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <GroupSizeFields
            spaceType={state.spaceType}
            minGroupSize={state.minGroupSize}
            maxGroupSize={state.maxGroupSize}
            disabled={readOnly}
            onMinChange={(value) => setState((s) => ({ ...s, minGroupSize: value }))}
            onMaxChange={(value) => setState((s) => ({ ...s, maxGroupSize: value }))}
          />
        </fieldset>
      </section>

      <section id="pricing" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Pricing &amp; booking period</h2>
        <fieldset disabled={readOnly} className="mt-4 disabled:opacity-80">
          <SpacePricingPeriodSection
            bookingUnit={state.bookingUnit}
            priceAmount={state.priceAmount}
            priceUnit={state.priceUnit}
            depositRequired={state.depositRequired}
            depositAmount={state.depositAmount}
            minBookingDuration={state.minBookingDuration}
            minBookingUnit={state.minBookingUnit}
            disabled={readOnly}
            onBookingUnitChange={(value) =>
              setState((s) => ({ ...s, bookingUnit: value }))
            }
            onPriceAmountChange={(value) =>
              setState((s) => ({ ...s, priceAmount: value }))
            }
            onPriceUnitChange={(value) =>
              setState((s) => ({
                ...s,
                priceUnit: value,
                priceAmount: value === "on_request" ? "" : s.priceAmount,
              }))
            }
            onDepositRequiredChange={(value) =>
              setState((s) => ({
                ...s,
                depositRequired: value,
                depositAmount: value ? s.depositAmount : "",
              }))
            }
            onDepositAmountChange={(value) =>
              setState((s) => ({ ...s, depositAmount: value }))
            }
            onMinBookingDurationChange={(value) =>
              setState((s) => ({ ...s, minBookingDuration: value }))
            }
            onMinBookingUnitChange={(value) =>
              setState((s) => ({ ...s, minBookingUnit: value }))
            }
          />
        </fieldset>
      </section>

      <div id="location">
        <AdminLocationSection
          readOnly={readOnly}
          value={{
            streetAddress: state.streetAddress,
            suburb: state.suburb,
            city: state.city,
            province: state.province,
            postalCode: state.postalCode,
            country: state.country,
            latitude: state.latitude,
            longitude: state.longitude,
          }}
          onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
        />
      </div>

      <AdminCrmLinkSection
        spaceId={activeSpaceId ?? undefined}
        initialLink={initialCrmLink}
        readOnly={readOnly}
        defaultOrganisationId={defaultOrganisationId}
        defaultOrganisationName={defaultOrganisationName}
        defaultContactId={defaultContactId}
        defaultContactName={defaultContactName}
        value={crmLink}
        onChange={(next) =>
          setCrmLink({
            crm_organisation_id: next.crm_organisation_id,
            crm_contact_id: next.crm_contact_id,
          })
        }
      />

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Features &amp; size</h2>
        <div className="mt-4">
          <SpaceCategoryFields
            embedded
            spaceType={state.spaceType}
            attributes={state.attributes}
            setAttributes={(updater) =>
              setState((s) => ({
                ...s,
                attributes:
                  typeof updater === "function" ? updater(s.attributes) : updater,
              }))
            }
          />
        </div>
      </section>

      {activeSpaceId ? (
        <SpaceBookingRequirementsSection spaceId={activeSpaceId} disabled={readOnly} />
      ) : null}

      <div id="ai-information">
        <SpaceAiInformationPanel
          spaceId={activeSpaceId ?? undefined}
          apiMode="admin"
          readOnly={readOnly}
        />
      </div>

      <section id="photos" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
        <AdminSpacePhotosPanel
          spaceId={activeSpaceId ?? undefined}
          images={images}
          onImagesChange={handleImagesChange}
          readOnly={readOnly}
        />
      </section>

      {!readOnly ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AdminCombinedSaveStateIndicator
              isMainFormDirty={isMainFormDirty}
              isSaving={saving}
              saveError={formSaveError || saveError}
              lastSavedAt={lastSavedAt}
            />
            <div className="flex flex-wrap gap-3">
            {activeMode === "edit" ? (
              <>
                <button
                  type="button"
                  disabled={saving || publishing || !isMainFormDirty}
                  onClick={() => void handleSave({ returnToProperty: true })}
                  className="rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {savingReturn
                    ? "Saving & returning…"
                    : savingContinue
                      ? "Saving…"
                      : propertyId
                        ? "Save & return to property"
                        : "Save"}
                </button>
                <button
                  type="button"
                  disabled={saving || publishing || !isMainFormDirty}
                  onClick={() => void handleSave({ returnToProperty: false })}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  {savingContinue ? "Saving…" : "Save & continue editing"}
                </button>
              </>
            ) : propertyId ? (
              <>
                <button
                  type="button"
                  disabled={saving || publishing}
                  onClick={() => void handleSave({ returnToProperty: false })}
                  className="rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {savingContinue ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  disabled={saving || publishing}
                  onClick={() => void handleSave({ returnToProperty: true })}
                  className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  {savingReturn ? "Saving & returning…" : "Save & return to property"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={saving || publishing}
                onClick={() => void handleSave({ returnToProperty: false })}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {savingContinue ? "Saving…" : "Save draft"}
              </button>
            )}
            {activeSpaceId ? (
              <button
                type="button"
                disabled={saving || publishing}
                onClick={() => void publish()}
                className="rounded-lg border border-[#0f2740] bg-white px-5 py-2.5 text-sm font-semibold text-[#0f2740] hover:bg-gray-50 disabled:opacity-60"
              >
                {publishing ? "Publishing…" : "Publish as unclaimed"}
              </button>
            ) : null}
            </div>
          </div>
          {formSaveError ? (
            <p role="alert" className="text-sm text-red-700">
              {formSaveError}
            </p>
          ) : null}
          <SectionInlineAlert status={saveStatus} error={saveError} className="mt-3" />
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3 text-sm">
            <Link
              href={resolvedBackHref}
              className="inline-flex items-center gap-1.5 font-medium text-gray-700 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {resolvedBackLabel}
            </Link>
            {!propertyId ? (
              <Link href={listHref} className="font-medium text-[#0f2740] hover:underline">
                {listLabel}
              </Link>
            ) : (
              <Link
                href="/admin/unclaimed-listings"
                className="font-medium text-gray-600 hover:underline"
              >
                All unclaimed listings
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </div>
    </>
  );

  if (wrapWithUnsavedGuard) {
    return (
      <UnsavedChangesProvider enabled={!readOnly}>{formContent}</UnsavedChangesProvider>
    );
  }

  return formContent;
}

function AdminCombinedSaveStateIndicator({
  isMainFormDirty,
  isSaving,
  saveError,
  lastSavedAt,
}: {
  isMainFormDirty: boolean;
  isSaving: boolean;
  saveError?: string | null;
  lastSavedAt?: Date | null;
}) {
  const unsavedCtx = useUnsavedChangesOptional();
  const showDirty = unsavedCtx?.hasUnsavedChanges ?? isMainFormDirty;

  return (
    <FormSaveStateIndicator
      isDirty={showDirty}
      isSaving={isSaving}
      saveError={saveError}
      lastSavedAt={lastSavedAt}
    />
  );
}

function AdminSpaceDetailsDirtyRegistration({
  isDirty,
  readOnly,
  handleSave,
}: {
  isDirty: boolean;
  readOnly: boolean;
  handleSave: (options: { returnToProperty: boolean }) => Promise<boolean>;
}) {
  useRegisterUnsavedSection("admin-space-details", {
    label: "Space details",
    isDirty,
    save: readOnly ? undefined : () => handleSave({ returnToProperty: false }),
  });
  return null;
}
