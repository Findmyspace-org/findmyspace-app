"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import SpaceCategoryFields from "@/app/components/SpaceCategoryFields";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import RequireAuth from "@/app/components/RequireAuth";
import DashboardShell from "@/app/components/DashboardShell";
import { HOST_NAV } from "@/lib/dashboard-nav";
import OwnerVerificationAlerts from "@/app/components/OwnerVerificationAlerts";
import {
  GroupSizeFields,
  groupSizePayloadFromForm,
  validateGroupSizeFormValues,
} from "@/app/components/GroupSizeFields";
import MarkdownDescriptionEditor from "@/app/components/MarkdownDescriptionEditor";
import { SpaceAiInformationPanel } from "@/app/components/SpaceAiInformationPanel";
import {
  SpacePricingPeriodSection,
  validateSpacePricingPeriodFormFields,
} from "@/app/components/SpacePricingPeriodSection";
import {
  spacePricingFormFromRow,
  spacePricingPayloadFromForm,
  validateSpacePricingFormValues,
} from "@/lib/space-pricing";
import {
  minBookingFormFromRow,
  minBookingPayloadFromForm,
  validateMinBookingFormValues,
  type MinBookingDurationUnit,
} from "@/lib/space-min-booking";
import { SectionInlineAlert } from "@/app/components/SectionInlineAlert";
import { useSectionFeedback } from "@/lib/use-section-feedback";
import {
  DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  emptyQuestionnaireDataForCategory,
  ListingBookingRequirements,
  mapSpaceTypeToIntelCategory,
  mergeQuestionnaireData,
  upsertListingBookingIntelTables,
} from "@/lib/booking-intelligence";
import {
  ListingBookingQualityFormFields,
  ListingQualityScoreSummary,
} from "@/app/components/listing-booking-quality-ui";
import { SpaceBookingRequirementsSection } from "@/app/components/SpaceBookingRequirementsSection";
import {
  SpaceLocationSection,
  type SpaceLocationValue,
} from "@/app/components/SpaceLocationSection";
import { SpacePhotosPanel } from "@/app/components/SpacePhotosPanel";
import { sortSpaceImages } from "@/lib/sort-space-images";
import type { SpacePhotoImage } from "@/lib/space-photos-client";
import {
  UnsavedChangesProvider,
  UnsavedSectionIndicator,
  useRegisterUnsavedSection,
} from "@/app/components/UnsavedChangesProvider";
import {
  canOwnerEditListing,
  getOwnerListingClaimHref,
  getOwnerListingCompletionHref,
  getOwnerListingStatusBadgeClass,
  getOwnerListingStatusLabel,
  isOwnerClaimOnboardingStatus,
  isOwnerListingLockedForEdit,
} from "@/lib/listing-lifecycle";

type PageProps = {
  params: Promise<{ id: string }>;
};

type DepositType = "none" | "one_month" | "two_months";

type SpaceAttributeRow = {
  attribute_key: string;
  attribute_value: string | null;
};

type OwnershipDocumentRow = {
  id: string;
  file_url: string;
  file_path: string | null;
  status: string | null;
};

type SpaceEditRow = {
  id: string;
  owner_id: string;
  title: string | null;
  description: string | null;
  city: string | null;
  suburb: string | null;
  street_address: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  address_line_1: string | null;
  space_type: string | null;
  booking_unit: string | null;
  price_amount: number | null;
  price_unit: string | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  status: string | null;
  ownership_proof_status: string | null;
  deposit_type: DepositType | null;
  deposit_months: number | null;
  monthly_payment_day: number | null;
  latitude: number | null;
  longitude: number | null;
};

type SpaceUpdatePayload = {
  title: string;
  description: string;
  city: string;
  suburb: string;
  street_address: string;
  province: string;
  postal_code: string;
  country: string;
  address_line_1: string;
  space_type: string;
  booking_unit: string;
  price_amount: number | null;
  price_unit: string;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  deposit_type: DepositType;
  deposit_months: number;
  monthly_payment_day: number;
  deposit_required: boolean;
  deposit_amount: number | null;
  min_group_size?: number | null;
  max_group_size?: number | null;
  latitude: number | null;
  longitude: number | null;
};

type SpaceAttributeInsertRow = {
  space_id: string;
  attribute_key: string;
  attribute_value: string;
};

function buildOwnerListingSnapshot(values: {
  title: string;
  description: string;
  city: string;
  suburb: string;
  streetAddress: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  spaceType: string;
  bookingUnit: string;
  priceAmount: string;
  priceUnit: string;
  depositRequired: boolean;
  depositAmount: string;
  minBookingDuration: string;
  minBookingUnit: MinBookingDurationUnit | "";
  minGroupSize: string;
  maxGroupSize: string;
  monthlyPaymentDay: string;
  attributes: Record<string, string[]>;
  bookingIntelData: Record<string, unknown>;
  bookingRequirements: ListingBookingRequirements;
}) {
  return JSON.stringify(values);
}

export default function EditListingPage({ params }: PageProps) {
  const router = useRouter();

  const [listingId, setListingId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const {
    status: saveStatus,
    error: saveError,
    setSuccess: setSaveSuccess,
    setFailure: setSaveFailure,
    clearForAction: clearSaveFeedback,
  } = useSectionFeedback();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [suburb, setSuburb] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [spaceType, setSpaceType] = useState("storage");
  const [bookingUnit, setBookingUnit] = useState("day");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceUnit, setPriceUnit] = useState("day");
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [minBookingDuration, setMinBookingDuration] = useState("");
  const [minBookingUnit, setMinBookingUnit] = useState<MinBookingDurationUnit | "">("");
  const [minGroupSize, setMinGroupSize] = useState("");
  const [maxGroupSize, setMaxGroupSize] = useState("");
  const [monthlyPaymentDay, setMonthlyPaymentDay] = useState("1");
  const [status, setStatus] = useState("pending");
  const [ownershipProofStatus, setOwnershipProofStatus] = useState("pending");

  const [attributes, setAttributes] = useState<Record<string, string[]>>({});
  const [images, setImages] = useState<SpacePhotoImage[]>([]);

  const [ownershipProof, setOwnershipProof] =
    useState<OwnershipDocumentRow | null>(null);
  const [newOwnershipProofFile, setNewOwnershipProofFile] =
    useState<File | null>(null);
  const [uploadingOwnershipProof, setUploadingOwnershipProof] = useState(false);

  const [bookingIntelData, setBookingIntelData] = useState<Record<string, unknown>>(() =>
    emptyQuestionnaireDataForCategory("storage")
  );
  const [bookingRequirements, setBookingRequirements] = useState<ListingBookingRequirements>({
    ...DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  });
  const [renterRequirementsCommitted, setRenterRequirementsCommitted] = useState(false);
  const savedListingBaselineRef = useRef("");

  const intelCategory = useMemo(() => mapSpaceTypeToIntelCategory(spaceType), [spaceType]);
  const listingQualityOptionsEdit = useMemo(
    () => ({
      renterRequirementsCommitted,
      spaceType,
      featureAttributes: attributes,
    }),
    [renterRequirementsCommitted, spaceType, attributes]
  );

  function patchBookingIntelSection(section: string, patch: Record<string, unknown>) {
    setBookingIntelData((prev) => ({
      ...prev,
      [section]: {
        ...((prev[section] as Record<string, unknown>) || {}),
        ...patch,
      },
    }));
  }

  function patchBookingIntelRoot(patch: Record<string, unknown>) {
    setBookingIntelData((prev) => ({ ...prev, ...patch }));
  }

  useEffect(() => {
    async function resolveParamsAndLoad() {
      const { id } = await params;
      setListingId(id);
      await loadListing(id);
    }

    resolveParamsAndLoad();
  }, [params]);

  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    if (window.location.hash !== "#booking-quality") return;
    window.requestAnimationFrame(() => {
      document.getElementById("booking-quality")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loading, listingId]);

  function patchLocation(patch: Partial<SpaceLocationValue>) {
    if (patch.streetAddress !== undefined) setStreetAddress(patch.streetAddress);
    if (patch.suburb !== undefined) setSuburb(patch.suburb);
    if (patch.city !== undefined) setCity(patch.city);
    if (patch.province !== undefined) setProvince(patch.province);
    if (patch.postalCode !== undefined) setPostalCode(patch.postalCode);
    if (patch.country !== undefined) setCountry(patch.country);
    if (patch.latitude !== undefined) setLatitude(patch.latitude);
    if (patch.longitude !== undefined) setLongitude(patch.longitude);
  }

  async function loadListing(id: string) {
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please log in first.");
      setLoading(false);
      return;
    }

    const { data: rawData, error } = await (supabase.from("spaces") as any)
      .select(
        "id, owner_id, title, description, city, suburb, street_address, province, postal_code, country, address_line_1, latitude, longitude, space_type, booking_unit, price_amount, price_unit, deposit_required, deposit_amount, price_per_hour, price_per_day, price_per_month, min_booking_hours, min_booking_days, min_booking_months, min_group_size, max_group_size, status, ownership_proof_status, deposit_type, deposit_months, monthly_payment_day"
      )
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();

    const data = rawData as SpaceEditRow | null;

    if (error || !data) {
      setMessage(error?.message || "Listing not found.");
      setLoading(false);
      return;
    }

    setOwnerId(data.owner_id ?? "");
    setTitle(data.title ?? "");
    setDescription(data.description ?? "");
    setCity(data.city ?? "");
    setSuburb(data.suburb ?? "");
    setStreetAddress(data.street_address ?? data.address_line_1 ?? "");
    setProvince(data.province ?? "");
    setPostalCode(data.postal_code ?? "");
    setCountry(data.country ?? "South Africa");
    setLatitude(
      typeof data.latitude === "number" && Number.isFinite(data.latitude)
        ? data.latitude
        : null
    );
    setLongitude(
      typeof data.longitude === "number" && Number.isFinite(data.longitude)
        ? data.longitude
        : null
    );
    setSpaceType(data.space_type ?? "storage");
    setBookingUnit(data.booking_unit ?? "day");
    const pricingForm = spacePricingFormFromRow(data);
    setPriceAmount(pricingForm.priceAmount);
    setPriceUnit(pricingForm.priceUnit);
    setDepositRequired(pricingForm.depositRequired);
    setDepositAmount(pricingForm.depositAmount);
    const minBookingForm = minBookingFormFromRow(data);
    setMinBookingDuration(minBookingForm.duration);
    setMinBookingUnit(minBookingForm.unit);
    setMinGroupSize(
      typeof data.min_group_size === "number" ? String(data.min_group_size) : ""
    );
    setMaxGroupSize(
      typeof data.max_group_size === "number" ? String(data.max_group_size) : ""
    );
    setMonthlyPaymentDay(String(data.monthly_payment_day ?? 1));
    const loadedStatus = data.status ?? "pending";
    setStatus(loadedStatus);
    setOwnershipProofStatus(data.ownership_proof_status ?? "pending");

    if (isOwnerClaimOnboardingStatus(loadedStatus)) {
      setLoading(false);
      router.replace(getOwnerListingClaimHref(id));
      return;
    }

    const { data: attributesData, error: attributesError } = await supabase
      .from("space_attributes")
      .select("attribute_key, attribute_value")
      .eq("space_id", id);

    if (attributesError) {
      setMessage(attributesError.message);
      setLoading(false);
      return;
    }

    const grouped: Record<string, string[]> = {};

    ((attributesData || []) as SpaceAttributeRow[]).forEach((row) => {
      if (!row.attribute_value) return;
      if (!grouped[row.attribute_key]) {
        grouped[row.attribute_key] = [];
      }
      grouped[row.attribute_key].push(row.attribute_value);
    });

    setAttributes(grouped);

    const { data: imageData, error: imageError } = await supabase
      .from("space_images")
      .select("id, image_url, file_path, sort_order")
      .eq("space_id", id)
      .order("sort_order", { ascending: true });

    if (imageError) {
      setMessage(imageError.message);
      setLoading(false);
      return;
    }

    setImages(sortSpaceImages((imageData || []) as SpacePhotoImage[]));

    const { data: ownershipData, error: ownershipError } = await supabase
      .from("listing_ownership_documents")
      .select("id, file_url, file_path, status")
      .eq("space_id", id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ownershipError) {
      setMessage(ownershipError.message);
      setLoading(false);
      return;
    }

    setOwnershipProof((ownershipData as OwnershipDocumentRow | null) || null);

    const intelCat = mapSpaceTypeToIntelCategory(data.space_type);
    const [{ data: qRow }, { data: reqRow }] = await Promise.all([
      (supabase.from("listing_questionnaires" as never) as any)
        .select("data, category")
        .eq("space_id", id)
        .maybeSingle(),
      (supabase.from("listing_booking_requirements" as never) as any)
        .select("*")
        .eq("space_id", id)
        .maybeSingle(),
    ]);

    const loadedIntelData = mergeQuestionnaireData(
      intelCat,
      (qRow?.data as Record<string, unknown>) || {}
    );
    setBookingIntelData(loadedIntelData);

    const loadedRequirements = reqRow
      ? {
          require_item_type: Boolean(reqRow.require_item_type),
          require_dimensions: Boolean(reqRow.require_dimensions),
          require_photos: Boolean(reqRow.require_photos),
          require_vehicle_details: Boolean(reqRow.require_vehicle_details),
          require_access_frequency: Boolean(reqRow.require_access_frequency),
          require_estimated_value: Boolean(reqRow.require_estimated_value),
          require_notes: Boolean(reqRow.require_notes),
        }
      : { ...DEFAULT_LISTING_BOOKING_REQUIREMENTS };

    if (reqRow) {
      setRenterRequirementsCommitted(true);
      setBookingRequirements(loadedRequirements);
    } else {
      setRenterRequirementsCommitted(false);
      setBookingRequirements(loadedRequirements);
    }

    savedListingBaselineRef.current = buildOwnerListingSnapshot({
      title: data.title ?? "",
      description: data.description ?? "",
      city: data.city ?? "",
      suburb: data.suburb ?? "",
      streetAddress: data.street_address ?? data.address_line_1 ?? "",
      province: data.province ?? "",
      postalCode: data.postal_code ?? "",
      country: data.country ?? "South Africa",
      latitude:
        typeof data.latitude === "number" && Number.isFinite(data.latitude)
          ? data.latitude
          : null,
      longitude:
        typeof data.longitude === "number" && Number.isFinite(data.longitude)
          ? data.longitude
          : null,
      spaceType: data.space_type ?? "storage",
      bookingUnit: data.booking_unit ?? "day",
      priceAmount: pricingForm.priceAmount,
      priceUnit: pricingForm.priceUnit,
      depositRequired: pricingForm.depositRequired,
      depositAmount: pricingForm.depositAmount,
      minBookingDuration: minBookingForm.duration,
      minBookingUnit: minBookingForm.unit,
      minGroupSize:
        typeof data.min_group_size === "number" ? String(data.min_group_size) : "",
      maxGroupSize:
        typeof data.max_group_size === "number" ? String(data.max_group_size) : "",
      monthlyPaymentDay: String(data.monthly_payment_day ?? 1),
      attributes: grouped,
      bookingIntelData: loadedIntelData,
      bookingRequirements: loadedRequirements,
    });

    setLoading(false);
  }

  async function uploadPrivateFile(
    bucket: string,
    ownerIdValue: string,
    file: File,
    folder: string
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be logged in to upload files.");
    }

    if (user.id !== ownerIdValue) {
      throw new Error("You can only upload files for your own account.");
    }

    const fileExt = file.name.split(".").pop() || "bin";
    const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, "-");
    const filePath = `${ownerIdValue}/${safeFolder}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return {
      filePath,
      fileUrl: data.publicUrl,
    };
  }

  async function handleUploadOwnershipProof() {
    setMessage("");

    if (!listingId || !ownerId) {
      setMessage("Listing not loaded yet.");
      return;
    }

    if (!newOwnershipProofFile) {
      setMessage("Please select an ownership proof file first.");
      return;
    }

    setUploadingOwnershipProof(true);

    try {
      const uploaded = await uploadPrivateFile(
        "listing-ownership",
        ownerId,
        newOwnershipProofFile,
        `ownership-${listingId}`
      );

      if (ownershipProof?.id) {
        const { error: updateError } = await (supabase
          .from("listing_ownership_documents") as any)
          .update({
            file_url: uploaded.fileUrl,
            file_path: uploaded.filePath,
            status: "pending",
          })
          .eq("id", ownershipProof.id);

        if (updateError) {
          setMessage(updateError.message);
          setUploadingOwnershipProof(false);
          return;
        }
      } else {
        const { data: insertedDoc, error: insertError } = await (supabase
          .from("listing_ownership_documents") as any)
          .insert({
            space_id: listingId,
            owner_id: ownerId,
            document_type: "ownership_proof",
            file_url: uploaded.fileUrl,
            file_path: uploaded.filePath,
            status: "pending",
          })
          .select("id, file_url, file_path, status")
          .single();

        if (insertError) {
          setMessage(insertError.message);
          setUploadingOwnershipProof(false);
          return;
        }

        setOwnershipProof(insertedDoc as OwnershipDocumentRow);
      }

      const { error: spaceUpdateError } = await (supabase.from("spaces") as any)
        .update({
          ownership_proof_status: "pending",
        })
        .eq("id", listingId);

      if (spaceUpdateError) {
        setMessage(spaceUpdateError.message);
        setUploadingOwnershipProof(false);
        return;
      }

      setOwnershipProofStatus("pending");
      setNewOwnershipProofFile(null);
      setMessage("Ownership proof uploaded successfully and sent for review.");
      await loadListing(listingId);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not upload ownership proof."
      );
    } finally {
      setUploadingOwnershipProof(false);
    }
  }

  const persistOwnerListing = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    clearSaveFeedback();

    let parsedMonthlyPaymentDay = 1;
    const effectiveBookingUnit =
      priceUnit === "hour" || priceUnit === "day" || priceUnit === "month"
        ? priceUnit
        : priceUnit === "event"
          ? "day"
          : bookingUnit;

    const pricingErr = validateSpacePricingFormValues(
      priceAmount,
      priceUnit,
      depositRequired,
      depositAmount
    );
    if (pricingErr) {
      setSaveFailure(pricingErr);
      setSaving(false);
      return false;
    }

    const pricingPayload = spacePricingPayloadFromForm(
      priceAmount,
      priceUnit,
      depositRequired,
      depositAmount
    );
    if (!pricingPayload.ok) {
      setSaveFailure(pricingPayload.error);
      setSaving(false);
      return false;
    }

    const minBookingErr = validateMinBookingFormValues(
      minBookingDuration,
      minBookingUnit
    );
    if (minBookingErr) {
      setSaveFailure(minBookingErr);
      setSaving(false);
      return false;
    }

    const minBookingPayload = minBookingPayloadFromForm(
      minBookingDuration,
      minBookingUnit
    );
    if (!minBookingPayload.ok) {
      setSaveFailure(minBookingPayload.error);
      setSaving(false);
      return false;
    }

    const periodErr = validateSpacePricingPeriodFormFields({
      bookingUnit,
      priceUnit,
      minBookingUnit,
      minBookingDuration,
    });
    if (periodErr) {
      setSaveFailure(periodErr);
      setSaving(false);
      return false;
    }

    if (effectiveBookingUnit === "month") {
      parsedMonthlyPaymentDay = Number(monthlyPaymentDay || "1");

      if (parsedMonthlyPaymentDay < 1 || parsedMonthlyPaymentDay > 28) {
        setSaveFailure("Monthly payment day must be between 1 and 28.");
        setSaving(false);
        return false;
      }
    }

    if (isOwnerListingLockedForEdit(status)) {
      setSaveFailure(
        "This listing cannot be edited while it is under review. Open the completion checklist for next steps."
      );
      setSaving(false);
      return false;
    }

    if (!canOwnerEditListing(status)) {
      setSaveFailure("You cannot edit this listing in its current status.");
      setSaving(false);
      return false;
    }

    const groupSizeErr = validateGroupSizeFormValues(spaceType, minGroupSize, maxGroupSize);
    if (groupSizeErr) {
      setSaveFailure(groupSizeErr);
      setSaving(false);
      return false;
    }

    const payload: SpaceUpdatePayload = {
      title,
      description,
      city,
      suburb,
      street_address: streetAddress,
      province,
      postal_code: postalCode,
      country,
      address_line_1: streetAddress,
      latitude,
      longitude,
      space_type: spaceType,
      booking_unit:
        minBookingPayload.data.min_booking_hours != null
          ? "hour"
          : minBookingPayload.data.min_booking_days != null
            ? "day"
            : minBookingPayload.data.min_booking_months != null
              ? "month"
              : pricingPayload.data.booking_unit,
      price_amount: pricingPayload.data.price_amount,
      price_unit: pricingPayload.data.price_unit,
      price_per_hour: pricingPayload.data.price_per_hour,
      price_per_day: pricingPayload.data.price_per_day,
      price_per_month: pricingPayload.data.price_per_month,
      ...minBookingPayload.data,
      deposit_type: "none",
      deposit_months: 0,
      monthly_payment_day: parsedMonthlyPaymentDay,
      deposit_required: pricingPayload.data.deposit_required,
      deposit_amount: pricingPayload.data.deposit_amount,
      ...groupSizePayloadFromForm(spaceType, minGroupSize, maxGroupSize),
    };

    const { error } = await (supabase.from("spaces") as any)
      .update(payload)
      .eq("id", listingId);

    if (error) {
      console.error("Listing save failed:", error);
      setSaveFailure("Could not save changes. Please try again.");
      setSaving(false);
      return false;
    }

    const { error: deleteAttributesError } = await supabase
      .from("space_attributes")
      .delete()
      .eq("space_id", listingId);

    if (deleteAttributesError) {
      console.error("Listing save failed:", deleteAttributesError);
      setSaveFailure("Could not save changes. Please try again.");
      setSaving(false);
      return false;
    }

    const attributeRows: SpaceAttributeInsertRow[] = Object.entries(
      attributes
    ).flatMap(([attributeKey, values]) =>
      values.map((value) => ({
        space_id: listingId,
        attribute_key: attributeKey,
        attribute_value: value,
      }))
    );

    if (attributeRows.length > 0) {
      const { error: insertAttributesError } = await (supabase
        .from("space_attributes") as any)
        .insert(attributeRows);

      if (insertAttributesError) {
        console.error("Listing save failed:", insertAttributesError);
        setSaveFailure("Could not save changes. Please try again.");
        setSaving(false);
        return false;
      }
    }

    const intelSave = await upsertListingBookingIntelTables(supabase as any, {
      spaceId: listingId,
      spaceType,
      questionnaireData: bookingIntelData,
      requirements: bookingRequirements,
    });
    if (intelSave.questionnaireError || intelSave.requirementsError) {
      console.error("Booking quality save failed:", intelSave);
      setSaveFailure("Could not save booking quality details. Please try again.");
      setSaving(false);
      return false;
    }
    setRenterRequirementsCommitted(true);

    savedListingBaselineRef.current = buildOwnerListingSnapshot({
      title,
      description,
      city,
      suburb,
      streetAddress,
      province,
      postalCode,
      country,
      latitude,
      longitude,
      spaceType,
      bookingUnit,
      priceAmount,
      priceUnit,
      depositRequired,
      depositAmount,
      minBookingDuration,
      minBookingUnit,
      minGroupSize,
      maxGroupSize,
      monthlyPaymentDay,
      attributes,
      bookingIntelData,
      bookingRequirements,
    });

    setSaveSuccess("Listing saved.");
    setSaving(false);
    return true;
  }, [
    attributes,
    bookingIntelData,
    bookingRequirements,
    bookingUnit,
    city,
    country,
    depositAmount,
    depositRequired,
    description,
    latitude,
    listingId,
    longitude,
    maxGroupSize,
    minBookingDuration,
    minBookingUnit,
    minGroupSize,
    monthlyPaymentDay,
    postalCode,
    priceAmount,
    priceUnit,
    province,
    clearSaveFeedback,
    setSaveFailure,
    setSaveSuccess,
    spaceType,
    status,
    streetAddress,
    suburb,
    title,
  ]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isMainFormDirty) {
      setSaveSuccess("No changes to save.");
      return;
    }
    await persistOwnerListing();
  }

  function getOwnershipBadgeClass(statusValue: string | null | undefined) {
    if (statusValue === "verified") return "bg-green-100 text-green-800";
    if (statusValue === "rejected") return "bg-red-100 text-red-800";
    return "bg-blue-100 text-blue-800";
  }

  function getStatusBadgeClass(statusValue: string | null | undefined) {
    return getOwnerListingStatusBadgeClass(statusValue);
  }

  const editingLocked = isOwnerListingLockedForEdit(status);
  const canEditContent = canOwnerEditListing(status);
  const completionHref = listingId
    ? getOwnerListingCompletionHref(listingId)
    : "/dashboard/listings";

  const isMainFormDirty = useMemo(() => {
    if (!canEditContent || editingLocked || loading || !listingId) return false;
    const current = buildOwnerListingSnapshot({
      title,
      description,
      city,
      suburb,
      streetAddress,
      province,
      postalCode,
      country,
      latitude,
      longitude,
      spaceType,
      bookingUnit,
      priceAmount,
      priceUnit,
      depositRequired,
      depositAmount,
      minBookingDuration,
      minBookingUnit,
      minGroupSize,
      maxGroupSize,
      monthlyPaymentDay,
      attributes,
      bookingIntelData,
      bookingRequirements,
    });
    return current !== savedListingBaselineRef.current;
  }, [
    attributes,
    bookingIntelData,
    bookingRequirements,
    bookingUnit,
    canEditContent,
    city,
    country,
    depositAmount,
    depositRequired,
    description,
    editingLocked,
    latitude,
    listingId,
    loading,
    longitude,
    maxGroupSize,
    minBookingDuration,
    minBookingUnit,
    minGroupSize,
    monthlyPaymentDay,
    postalCode,
    priceAmount,
    priceUnit,
    province,
    spaceType,
    streetAddress,
    suburb,
    title,
  ]);

  return (
    <RequireAuth>
      <UnsavedChangesProvider
        enabled={canEditContent && !editingLocked}
        backFallbackHref="/dashboard/listings"
      >
      <DashboardShell
        workspaceLabel="Hosting"
        pageTitle="Edit listing"
        pageSubtitle="Update the details of your space."
        navItems={HOST_NAV}
        activeHref="/dashboard/listings"
      >
        <OwnerListingDirtyRegistration
          isDirty={isMainFormDirty}
          canSave={canEditContent && !editingLocked}
          persistOwnerListing={persistOwnerListing}
        />
        <div className="mx-auto max-w-4xl text-black">
          <div className="mb-8">
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="mb-2 text-4xl font-bold">Edit listing</h1>
                <p className="text-gray-600">
                  Update the details of your space.
                </p>
              </div>

              <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current status
                </p>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                    status
                  )}`}
                >
                  {getOwnerListingStatusLabel(status)}
                </span>
              </div>
            </div>

            {editingLocked ? (
              <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                <p className="font-medium">Listing under review</p>
                <p className="mt-1">
                  This listing is not editable while FindMySpace reviews it. Check
                  the completion page for status and admin notes.
                </p>
                <Link
                  href={completionHref}
                  className="mt-3 inline-block font-semibold text-[#0f2740] underline"
                >
                  Open completion checklist
                </Link>
              </div>
            ) : null}

            {!canEditContent && !editingLocked ? (
              <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                This listing cannot be edited in its current status.
              </div>
            ) : null}

            <div className="mb-6">
              <OwnerVerificationAlerts />
            </div>

            {listingId ? (
              <p className="mb-6 text-sm text-gray-600">
                Use <strong>Booking requirements</strong> below for questions renters answer when
                requesting this space. Category-specific assistant details are in{" "}
                <Link
                  href={`/spaces/${listingId}/booking-quality`}
                  className="font-medium text-[#192a3a] underline underline-offset-2"
                >
                  booking quality
                </Link>
                .
              </p>
            ) : null}
          </div>

          {message && (
            <div className="mb-6 rounded-md bg-gray-100 p-3 text-sm text-gray-800">
              {message}
            </div>
          )}

          {loading ? (
            <div className="rounded-md border border-gray-300 p-6 text-sm text-gray-600 shadow-sm">
              Loading listing...
            </div>
          ) : (
            <form
              onSubmit={handleSave}
              className="space-y-5 rounded-md border border-gray-300 bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-medium text-gray-900">
                Listing details
                <UnsavedSectionIndicator show={isMainFormDirty} />
              </p>
              <fieldset
                disabled={saving || editingLocked || !canEditContent}
                className="space-y-5 disabled:opacity-60"
              >
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-sm border border-gray-400 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Description
                </label>
                <MarkdownDescriptionEditor
                  value={description}
                  onChange={setDescription}
                  rows={5}
                  textareaClassName="w-full px-4 py-3 text-sm outline-none"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Space type
                  </label>
                  <select
                    value={spaceType}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSpaceType(next);
                      setAttributes({});
                      setBookingIntelData(
                        emptyQuestionnaireDataForCategory(mapSpaceTypeToIntelCategory(next))
                      );
                    }}
                    className="w-full rounded-sm border border-gray-400 px-4 py-3 outline-none"
                  >
                    {!LISTING_SPACE_TYPE_OPTIONS.some((o) => o.value === spaceType) &&
                      spaceType && (
                        <option value={spaceType}>{spaceType}</option>
                      )}
                    {LISTING_SPACE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <GroupSizeFields
                  spaceType={spaceType}
                  minGroupSize={minGroupSize}
                  maxGroupSize={maxGroupSize}
                  onMinChange={setMinGroupSize}
                  onMaxChange={setMaxGroupSize}
                  inputClassName="w-full rounded-sm border border-gray-400 px-4 py-3 outline-none"
                  labelClassName="mb-1 block text-xs font-medium text-gray-700"
                />
              </div>

              <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Pricing &amp; booking period
                </h3>
                <div className="mt-3">
                  <SpacePricingPeriodSection
                    bookingUnit={bookingUnit}
                    priceAmount={priceAmount}
                    priceUnit={priceUnit}
                    depositRequired={depositRequired}
                    depositAmount={depositAmount}
                    minBookingDuration={minBookingDuration}
                    minBookingUnit={minBookingUnit}
                    disabled={editingLocked}
                    onBookingUnitChange={setBookingUnit}
                    onPriceAmountChange={setPriceAmount}
                    onPriceUnitChange={(value) => {
                      setPriceUnit(value);
                      if (value === "on_request") setPriceAmount("");
                    }}
                    onDepositRequiredChange={(value) => {
                      setDepositRequired(value);
                      if (!value) setDepositAmount("");
                    }}
                    onDepositAmountChange={setDepositAmount}
                    onMinBookingDurationChange={setMinBookingDuration}
                    onMinBookingUnitChange={setMinBookingUnit}
                    inputClassName="w-full rounded-sm border border-gray-400 px-4 py-3 outline-none"
                    labelClassName="mb-1 block text-xs font-medium text-gray-700"
                  />
                </div>

                {priceUnit === "month" ? (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Monthly payment day
                    </label>
                    <select
                      value={monthlyPaymentDay}
                      onChange={(e) => setMonthlyPaymentDay(e.target.value)}
                      disabled={editingLocked}
                      className="w-full rounded-sm border border-gray-400 px-4 py-3 outline-none"
                    >
                      {Array.from({ length: 28 }, (_, index) => {
                        const day = index + 1;
                        return (
                          <option key={day} value={day}>
                            Day {day}
                          </option>
                        );
                      })}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Due date for each monthly payment.
                    </p>
                  </div>
                ) : null}
              </div>

              <SpaceLocationSection
                apiMode="owner"
                readOnly={editingLocked}
                value={{
                  streetAddress,
                  suburb,
                  city,
                  province,
                  postalCode,
                  country,
                  latitude,
                  longitude,
                }}
                onChange={patchLocation}
              />

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Features &amp; size</h2>
                <div className="mt-4">
                  <SpaceCategoryFields
                    embedded
                    spaceType={spaceType}
                    attributes={attributes}
                    setAttributes={setAttributes}
                  />
                </div>
              </section>

              <SpaceBookingRequirementsSection
                spaceId={listingId || ""}
                disabled={editingLocked}
              />

              <SpaceAiInformationPanel
                spaceId={listingId || undefined}
                apiMode="owner"
                readOnly={editingLocked}
              />

              <section
                id="photos"
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
                <SpacePhotosPanel
                  apiMode="owner"
                  spaceId={listingId || undefined}
                  images={images}
                  onImagesChange={setImages}
                  readOnly={editingLocked || !canEditContent}
                />
              </section>

              <section
                id="booking-quality"
                className="scroll-mt-24 rounded-xl border border-[#e2e8f0] bg-gradient-to-b from-[#fbfcfd] to-white p-5 shadow-sm"
              >
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <div>
                      <h2 className="text-lg font-semibold text-[#192a3a]">
                        Booking quality details
                        <span className="ml-2 text-xs font-normal text-gray-500">(optional)</span>
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Extra details for the Space Assistant — not shown on your public listing.
                      </p>
                    </div>
                    <span className="text-gray-500 transition group-open:rotate-180" aria-hidden>
                      ▼
                    </span>
                  </summary>
                  <div className="mt-5 space-y-5 border-t border-[#eef2f6] pt-5">
                    <ListingQualityScoreSummary
                      intelCategory={intelCategory}
                      data={bookingIntelData}
                      listingQualityOptions={listingQualityOptionsEdit}
                      spaceTypeLabel={spaceType ? `Category: ${spaceType}` : undefined}
                      compact
                      footerHint="Saves when you click Save changes."
                    />
                    <ListingBookingQualityFormFields
                      intelCategory={intelCategory}
                      questionnaireData={bookingIntelData}
                      onPatchSection={patchBookingIntelSection}
                      onPatchRoot={patchBookingIntelRoot}
                      requirements={bookingRequirements}
                      onRequirementsChange={setBookingRequirements}
                      spaceType={spaceType}
                      hideRenterRequirementChecklist
                    />
                  </div>
                </details>
              </section>

              <div className="rounded-sm border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Ownership proof
                    </p>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getOwnershipBadgeClass(
                          ownershipProofStatus
                        )}`}
                      >
                        {ownershipProofStatus || "pending"}
                      </span>
                    </div>
                  </div>

                  {ownershipProof?.file_url ? (
                    <a
                      href={ownershipProof.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border px-4 py-2 text-sm"
                    >
                      View current proof
                    </a>
                  ) : (
                    <span className="rounded-sm border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
                      No ownership proof uploaded yet
                    </span>
                  )}
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Upload or replace ownership proof
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) =>
                      setNewOwnershipProofFile(e.target.files?.[0] || null)
                    }
                    className="w-full rounded-sm border border-gray-400 px-4 py-3 outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {newOwnershipProofFile
                      ? newOwnershipProofFile.name
                      : "Upload proof of ownership for this specific space."}
                  </p>

                  <button
                    type="button"
                    onClick={handleUploadOwnershipProof}
                    disabled={uploadingOwnershipProof || !newOwnershipProofFile}
                    className="mt-3 rounded-sm border px-4 py-2 text-sm disabled:opacity-60"
                  >
                    {uploadingOwnershipProof
                      ? "Uploading..."
                      : ownershipProof
                        ? "Replace ownership proof"
                        : "Upload ownership proof"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || editingLocked || !canEditContent || !isMainFormDirty}
                className="w-full rounded-sm bg-black px-4 py-3 text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <SectionInlineAlert status={saveStatus} error={saveError} />
              </fieldset>
            </form>
          )}
        </div>
      </DashboardShell>
      </UnsavedChangesProvider>
    </RequireAuth>
  );
}

function OwnerListingDirtyRegistration({
  isDirty,
  canSave,
  persistOwnerListing,
}: {
  isDirty: boolean;
  canSave: boolean;
  persistOwnerListing: () => Promise<boolean>;
}) {
  useRegisterUnsavedSection("owner-listing-details", {
    label: "Listing details",
    isDirty,
    save: canSave ? persistOwnerListing : undefined,
  });
  return null;
}