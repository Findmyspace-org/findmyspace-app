"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Check, CheckCircle2, Share2, X } from "lucide-react";
import ListingFormStepNav, {
  type ListingFormStepMeta,
} from "@/app/components/ListingFormStepNav";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  emptyQuestionnaireDataForCategory,
  ListingBookingRequirements,
  mapSpaceTypeToIntelCategory,
  mergeQuestionnaireData,
  renterRequirementKeysForCategory,
  RENTER_REQUIREMENT_LABELS,
  upsertListingBookingIntelTables,
} from "@/lib/booking-intelligence";
import {
  ListingBookingQualityFormFields,
  ListingQualityScoreSummary,
} from "@/app/components/listing-booking-quality-ui";
import {
  getPendingAdvisorCode,
  normalizeAdvisorCode,
  setPendingAdvisorCode,
} from "@/lib/advisor-code";
import SpaceCategoryFields from "@/app/components/SpaceCategoryFields";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import {
  clearSpaceFormDraft,
  readSpaceFormDraft,
  writeSpaceFormDraft,
} from "@/lib/spaceFormDraftStorage";
import { formatListingAddress, ZA_PROVINCES } from "@/lib/za-provinces";

const MapPicker = dynamic(() => import("@/app/components/MapPicker"), {
  ssr: false,
});

const DRAFT_BANNER_DISMISSED_KEY = "findmyspace_listing_draft_banner_dismissed";

const LISTING_CREATE_STEPS: ListingFormStepMeta[] = [
  { id: "basics", label: "Basics & pricing", shortLabel: "Basics" },
  { id: "location", label: "Location & photos", shortLabel: "Place" },
  { id: "features", label: "Features & booking", shortLabel: "Details" },
  { id: "review", label: "Review & submit", shortLabel: "Review" },
];

type SpaceFormProps = {
  onCreated?: () => void | Promise<void>;
};

type InsertedSpace = {
  id: string;
};

type DepositType = "none" | "one_month" | "two_months";

type SpaceInsertPayload = {
  owner_id: string;
  title: string;
  description: string;
  space_type: string;
  booking_unit: string;
  price_per_hour: number | null;
  price_per_day: number | null;
  price_per_month: number | null;
  min_booking_hours: number | null;
  min_booking_days: number | null;
  min_booking_months: number | null;
  city: string;
  suburb: string;
  street_address: string;
  province: string;
  postal_code: string;
  country: string;
  // Backward-compatible legacy field.
  address_line_1: string;
  latitude: number;
  longitude: number;
  status: string;
  verification_status: string;
  ownership_proof_status: string;
  deposit_type: DepositType;
  deposit_months: number;
  monthly_payment_day: number;
  deposit_required: boolean;
  deposit_amount: number | null;
  advisor_id?: string | null;
  advisor_code?: string | null;
  advisor_source?: string | null;
};

type AddressSuggestion = {
  label: string;
  streetAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

type SpaceImageInsertRow = {
  space_id: string;
  image_url: string;
  file_path: string;
  sort_order: number;
};

type SpaceAttributeInsertRow = {
  space_id: string;
  attribute_key: string;
  attribute_value: string;
};

type ListingOwnershipInsertRow = {
  space_id: string;
  owner_id: string;
  document_type: string;
  file_url: string;
  file_path: string;
  status: string;
};

export default function SpaceForm({ onCreated }: SpaceFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [suburb, setSuburb] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("South Africa");
  const [spaceType, setSpaceType] = useState("storage");
  const [bookingUnit, setBookingUnit] = useState("day");

  const [pricePerHour, setPricePerHour] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [pricePerMonth, setPricePerMonth] = useState("");
  const [minBookingHours, setMinBookingHours] = useState("1");
  const [minBookingDays, setMinBookingDays] = useState("1");
  const [minBookingMonths, setMinBookingMonths] = useState("1");

  const [depositType, setDepositType] = useState<DepositType>("none");

  const [latitude, setLatitude] = useState(-33.7342);
  const [longitude, setLongitude] = useState(18.9621);

  const [ownershipProofFile, setOwnershipProofFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [attributes, setAttributes] = useState<Record<string, string[]>>({});

  const [bookingIntelData, setBookingIntelData] = useState<Record<string, unknown>>(() =>
    emptyQuestionnaireDataForCategory(mapSpaceTypeToIntelCategory("storage"))
  );
  const [bookingRequirements, setBookingRequirements] = useState<ListingBookingRequirements>({
    ...DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0);
  const [stepFieldError, setStepFieldError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const stepContentAnchorRef = useRef<HTMLDivElement | null>(null);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [usingDeviceLocation, setUsingDeviceLocation] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsOpen, setAddressSuggestionsOpen] = useState(false);
  const [suburbTouched, setSuburbTouched] = useState(false);
  const [cityTouched, setCityTouched] = useState(false);
  const [provinceTouched, setProvinceTouched] = useState(false);
  const [postalCodeTouched, setPostalCodeTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const draftSaveSkipRef = useRef(true);

  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [submittedPhotoCount, setSubmittedPhotoCount] = useState(0);
  const [momentumAdvisorNote, setMomentumAdvisorNote] = useState<string | null>(
    null
  );
  const [shareCopied, setShareCopied] = useState(false);

  const [manualAdvisorCode, setManualAdvisorCode] = useState("");
  const [profileAdvisor, setProfileAdvisor] = useState<{
    advisor_id: string | null;
    advisor_code: string | null;
    advisor_source: string | null;
  } | null>(null);
  const suggestionAbortRef = useRef<AbortController | null>(null);

  const intelCategory = useMemo(() => mapSpaceTypeToIntelCategory(spaceType), [spaceType]);

  const listingQualityOptionsCreate = useMemo(
    () => ({
      renterRequirementsCommitted: true,
      spaceType,
      featureAttributes: attributes,
    }),
    [spaceType, attributes]
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
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await (supabase.from("profiles") as any)
        .select("advisor_id, advisor_code, advisor_source")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && data) {
        setProfileAdvisor(
          data as {
            advisor_id: string | null;
            advisor_code: string | null;
            advisor_source: string | null;
          }
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        localStorage.getItem(DRAFT_BANNER_DISMISSED_KEY) === "1"
      ) {
        setDraftBannerDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const d = readSpaceFormDraft();
    if (!d) return;
    draftSaveSkipRef.current = true;
    setTitle(d.title);
    setDescription(d.description);
    setCity(d.city);
    setSuburb(d.suburb);
    setStreetAddress(d.streetAddress);
    setSpaceType(d.spaceType);
    setBookingUnit(d.bookingUnit);
    setPricePerHour(d.pricePerHour);
    setPricePerDay(d.pricePerDay);
    setPricePerMonth(d.pricePerMonth);
    setMinBookingHours(d.minBookingHours);
    setMinBookingDays(d.minBookingDays);
    setMinBookingMonths(d.minBookingMonths);
    setProvince(d.province);
    setPostalCode(d.postalCode);
    setCountry(d.country || "South Africa");
    setDepositType((d.depositType as DepositType) || "none");
    setLatitude(d.latitude);
    setLongitude(d.longitude);
    setManualAdvisorCode(d.manualAdvisorCode);
    setAttributes(d.attributes || {});
    const step = typeof d.currentStep === "number" && d.currentStep >= 0 && d.currentStep < 4 ? d.currentStep : 0;
    const maxU =
      typeof d.maxUnlockedStep === "number" && d.maxUnlockedStep >= 0 && d.maxUnlockedStep < 4
        ? d.maxUnlockedStep
        : step;
    setCurrentStep(step);
    setMaxUnlockedStep(Math.max(step, maxU));
    if (d.bookingIntelData && typeof d.bookingIntelData === "object") {
      const cat = mapSpaceTypeToIntelCategory(d.spaceType);
      setBookingIntelData(mergeQuestionnaireData(cat, d.bookingIntelData));
    }
    if (d.bookingRequirements && typeof d.bookingRequirements === "object") {
      setBookingRequirements({
        ...DEFAULT_LISTING_BOOKING_REQUIREMENTS,
        ...d.bookingRequirements,
      } as ListingBookingRequirements);
    }
    setDraftRestored(true);
    setTimeout(() => {
      draftSaveSkipRef.current = false;
    }, 0);
  }, []);

  function dismissDraftBanner() {
    try {
      localStorage.setItem(DRAFT_BANNER_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDraftBannerDismissed(true);
  }

  useEffect(() => {
    if (draftSaveSkipRef.current || submitted) return;
    const t = window.setTimeout(() => {
      writeSpaceFormDraft({
        title,
        description,
        city,
        suburb,
        streetAddress,
        spaceType,
        bookingUnit,
        pricePerHour,
        pricePerDay,
        pricePerMonth,
        minBookingHours,
        minBookingDays,
        minBookingMonths,
        province,
        postalCode,
        country,
        depositType,
        latitude,
        longitude,
        manualAdvisorCode,
        attributes,
        currentStep,
        maxUnlockedStep,
        bookingIntelData,
        bookingRequirements: { ...bookingRequirements },
      });
      setDraftSavedAt(Date.now());
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    title,
    description,
    city,
    suburb,
    streetAddress,
    spaceType,
    bookingUnit,
    pricePerHour,
    pricePerDay,
    pricePerMonth,
    minBookingHours,
    minBookingDays,
    minBookingMonths,
    province,
    postalCode,
    country,
    depositType,
    latitude,
    longitude,
    manualAdvisorCode,
    attributes,
    submitted,
    currentStep,
    maxUnlockedStep,
    bookingIntelData,
    bookingRequirements,
  ]);

  const priceMissing = useMemo(() => {
    if (bookingUnit === "hour") {
      return !pricePerHour || Number(pricePerHour) <= 0;
    }
    if (bookingUnit === "month") {
      return !pricePerMonth || Number(pricePerMonth) <= 0;
    }
    return !pricePerDay || Number(pricePerDay) <= 0;
  }, [bookingUnit, pricePerHour, pricePerDay, pricePerMonth]);

  function validateListingStep(stepIndex: number): string | null {
    if (stepIndex === 0) {
      if (!title.trim()) return "Please add a title for your listing.";
      if (!spaceType) return "Select a space type.";
      if (priceMissing) return "Please enter a valid price for your booking unit.";
      if (bookingUnit === "hour" && Number(minBookingHours || 0) < 1) {
        return "Minimum booking hours must be at least 1.";
      }
      if (bookingUnit === "day" && Number(minBookingDays || 0) < 1) {
        return "Minimum booking days must be at least 1.";
      }
      if (bookingUnit === "month" && Number(minBookingMonths || 0) < 1) {
        return "Minimum booking months must be at least 1.";
      }
      return null;
    }
    if (stepIndex === 1) {
      if (!streetAddress.trim()) return "Please enter a street address.";
      if (!suburb.trim()) return "Please enter a suburb.";
      if (!city.trim()) return "Please enter a city.";
      if (!province.trim()) return "Please select a province.";
      if (!postalCode.trim()) return "Please enter a postal code.";
      if (!country.trim()) return "Please enter a country.";
      if (imageFiles.length < 1) return "Add at least one photo of your space.";
      return null;
    }
    if (stepIndex === 2) {
      return null;
    }
    return null;
  }

  function goToListingStep(next: number) {
    setStepFieldError(null);
    setCurrentStep(next);
    window.requestAnimationFrame(() => {
      stepContentAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleStepNavClick(index: number) {
    if (index > maxUnlockedStep) return;
    goToListingStep(index);
  }

  function goNextStep() {
    const err = validateListingStep(currentStep);
    if (err) {
      setStepFieldError(err);
      return;
    }
    setStepFieldError(null);
    const next = Math.min(currentStep + 1, LISTING_CREATE_STEPS.length - 1);
    setMaxUnlockedStep((m) => Math.max(m, next));
    goToListingStep(next);
  }

  function goPrevStep() {
    if (currentStep <= 0) return;
    goToListingStep(currentStep - 1);
  }

  const reviewPriceLabel = useMemo(() => {
    if (bookingUnit === "hour" && pricePerHour && Number(pricePerHour) > 0) {
      return `R${Number(pricePerHour).toFixed(2)} / hour`;
    }
    if (bookingUnit === "month" && pricePerMonth && Number(pricePerMonth) > 0) {
      return `R${Number(pricePerMonth).toFixed(2)} / month`;
    }
    if (pricePerDay && Number(pricePerDay) > 0) {
      return `R${Number(pricePerDay).toFixed(2)} / day`;
    }
    return "—";
  }, [bookingUnit, pricePerHour, pricePerDay, pricePerMonth]);

  const renterRequirementsSummary = useMemo(() => {
    const keys = renterRequirementKeysForCategory(intelCategory);
    return keys
      .filter((k) => bookingRequirements[k])
      .map((k) => RENTER_REQUIREMENT_LABELS[k]);
  }, [intelCategory, bookingRequirements]);

  const featureSelectionCount = useMemo(() => {
    return Object.values(attributes).reduce((n, arr) => n + (arr?.length || 0), 0);
  }, [attributes]);

  const imagePreviews = useMemo(() => {
    return imageFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }, [imageFiles]);

  function getCommissionRate(unit: string) {
    if (unit === "hour") return 0.20;
    if (unit === "day") return 0.15;
    if (unit === "month") return 0.15;
    return 0.15;
  }

  function addImageFiles(files: FileList | null) {
    if (!files) return;
    setImageFiles((current) => [...current, ...Array.from(files)]);
  }

  function removeImageAt(index: number) {
    setImageFiles((current) => current.filter((_, i) => i !== index));
    setPreviewIndex((current) => {
      if (current === null) return current;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImageFiles((current) => {
      const next = [...current];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });

    setPreviewIndex((current) => {
      if (current === null) return current;
      if (current === index) return index + direction;
      if (current === index + direction) return index;
      return current;
    });
  }

  function calculatePayoutBreakdown(price: number) {
    const rate = getCommissionRate(bookingUnit);
    const paymentFee = price * 0.035;
    const commission = price * rate;
    const vatOnCommission = commission * 0.16;
    const payout = price - paymentFee - commission - vatOnCommission;

    return {
      paymentFee,
      commission,
      vatOnCommission,
      payout,
    };
  }

  function pickReverseAddressFields(
    addr: Record<string, string | undefined>,
    displayName?: string
  ) {
    /**
     * Address line 1 should stay street-level.
     * Avoid locality-like components (e.g. suburb/city_district) here.
     */
    const streetName =
      addr.road || addr.pedestrian || addr.footway || addr.path || "";
    const streetAddress = [addr.house_number, streetName].filter(Boolean).join(" ").trim();
    const fallbackStreetLine = (displayName || "").split(",")[0]?.trim() || "";

    /**
     * Suburb should prefer locality/neighbourhood style values.
     * Use district-like values only as lower-priority fallbacks.
     */
    const suburbValue =
      addr.suburb ||
      addr.neighbourhood ||
      addr.neighborhood ||
      addr.quarter ||
      addr.district ||
      addr.locality ||
      addr.borough ||
      addr.hamlet ||
      addr.residential ||
      "";

    /**
     * City should be municipality/city-level value.
     */
    const cityValue =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state_district ||
      "";

    const provinceValue = addr.state || addr.province || "";
    const postalCodeValue = addr.postcode || "";
    const countryValue = addr.country || "South Africa";

    /**
     * If street-level data is missing, keep line1 blank and let caller
     * decide whether to preserve existing user-entered line1.
     */
    return {
      streetAddress: streetAddress || streetName || fallbackStreetLine,
      suburbValue,
      cityValue,
      provinceValue,
      postalCodeValue,
      countryValue,
    };
  }

  function shouldOverwriteWithReverse(
    current: string,
    next: string,
    touched: boolean,
    forcePopulate: boolean
  ) {
    if (!next) return false;
    if (forcePopulate) return true;
    if (!current) return true;
    if (!touched) return true;
    return false;
  }

  async function reverseGeocode(
    lat: number,
    lng: number,
    options?: { forcePopulate?: boolean }
  ) {
    setReverseGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      );
      if (!res.ok) {
        throw new Error("Reverse geocoding failed.");
      }

      const data = await res.json();
      const addr = data.address || {};
      const {
        streetAddress: nextStreetAddress,
        suburbValue,
        cityValue,
        provinceValue,
        postalCodeValue,
        countryValue,
      } = pickReverseAddressFields(
        addr as Record<string, string | undefined>,
        (data.display_name as string | undefined) || ""
      );
      const forcePopulate = Boolean(options?.forcePopulate);

      setStreetAddress((current) => {
        if (forcePopulate && nextStreetAddress) return nextStreetAddress;
        if (!current) return nextStreetAddress;

        const hasNumber = /\d/.test(current);

        if (!forcePopulate && hasNumber && nextStreetAddress) {
          const number = current.match(/\d+[A-Za-z-]*/)?.[0] || "";
          const roadOnly =
            nextStreetAddress
              .replace(/^(\d+[A-Za-z-]*\s*)/, "")
              .trim() || nextStreetAddress;
          return `${number} ${roadOnly}`.trim();
        }

        return current;
      });

      setSuburb((current) =>
        shouldOverwriteWithReverse(current, suburbValue, suburbTouched, forcePopulate)
          ? suburbValue
          : current
      );

      setCity((current) =>
        shouldOverwriteWithReverse(current, cityValue, cityTouched, forcePopulate)
          ? cityValue
          : current
      );
      setProvince((current) =>
        shouldOverwriteWithReverse(current, provinceValue, provinceTouched, forcePopulate)
          ? provinceValue
          : current
      );
      setPostalCode((current) =>
        shouldOverwriteWithReverse(current, postalCodeValue, postalCodeTouched, forcePopulate)
          ? postalCodeValue
          : current
      );
      if (countryValue) setCountry(countryValue);
    } catch (error) {
      console.error("Reverse geocoding failed", error);
    } finally {
      setReverseGeocoding(false);
    }
  }

  useEffect(() => {
    const query = [streetAddress.trim(), suburb.trim(), city.trim(), province.trim(), country.trim()]
      .filter(Boolean)
      .join(", ");

    if (streetAddress.trim().length < 3) {
      setAddressSuggestions([]);
      setAddressSuggestionsOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        suggestionAbortRef.current?.abort();
        const controller = new AbortController();
        suggestionAbortRef.current = controller;

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(
            query
          )}&limit=5`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as Array<{
          display_name?: string;
          lat?: string;
          lon?: string;
          address?: Record<string, string | undefined>;
        }>;

        // NOTE: This powers current OSM suggestions and keeps fields aligned for
        // future Google Places autocomplete integration.
        const next = (data || [])
          .map((item) => {
            const lat = Number(item.lat);
            const lng = Number(item.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const fields = pickReverseAddressFields(item.address || {});
            return {
              label: item.display_name || `${fields.streetAddress}, ${fields.cityValue}`,
              streetAddress: fields.streetAddress,
              suburb: fields.suburbValue,
              city: fields.cityValue,
              province: fields.provinceValue,
              postalCode: fields.postalCodeValue,
              country: fields.countryValue,
              latitude: lat,
              longitude: lng,
            };
          })
          .filter(Boolean) as AddressSuggestion[];

        setAddressSuggestions(next);
        setAddressSuggestionsOpen(next.length > 0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Address autocomplete lookup failed", error);
        }
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [streetAddress, suburb, city, province, country]);

  async function searchAddressOnMap() {
    setSearchingAddress(true);
    try {
      const query = [streetAddress, suburb, city, province, country]
        .filter(Boolean)
        .join(", ");

      if (!query) {
        setMessage("Please enter an address, suburb, or city first.");
        setSearchingAddress(false);
        return;
      }

      setMessage("Searching address on map...");

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          query
        )}&limit=1`
      );
      if (!res.ok) {
        throw new Error("Address search failed.");
      }

      const data = await res.json();

      if (!data || data.length === 0) {
        setMessage("Address not found. Try a more specific search.");
        return;
      }

      const result = data[0];
      const lat = Number(result.lat);
      const lng = Number(result.lon);

      setLatitude(lat);
      setLongitude(lng);
      await reverseGeocode(lat, lng, { forcePopulate: true });
      setMessage("Address found on map.");
    } catch (error) {
      console.error("Address search failed", error);
      setMessage("Could not search for the address.");
    } finally {
      setSearchingAddress(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not supported by your browser.");
      return;
    }

    setUsingDeviceLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat);
        setLongitude(lng);
        await reverseGeocode(lat, lng, { forcePopulate: true });
        setMessage("Location found.");
        setUsingDeviceLocation(false);
      },
      () => {
        setMessage("Location access was denied or unavailable.");
        setUsingDeviceLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  async function uploadPrivateFile(
    bucket: string,
    ownerId: string,
    file: File,
    folder: string
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You must be logged in to upload files.");
    }

    if (user.id !== ownerId) {
      throw new Error("You can only upload files for your own account.");
    }

    const fileExt = file.name.split(".").pop() || "bin";
    const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, "-");
    const filePath = `${ownerId}/${safeFolder}-${Date.now()}.${fileExt}`;

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

  async function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault();
    if (currentStep !== LISTING_CREATE_STEPS.length - 1) {
      return;
    }
    setMessage("");
    setStepFieldError(null);
    setLoading(true);

    if (!ownershipProofFile) {
      const msg = "Please upload proof of ownership for this space.";
      setStepFieldError(msg);
      setMessage(msg);
      setLoading(false);
      return;
    }

    if (imageFiles.length < 1) {
      const msg = "Add at least one image so renters can see your space.";
      setStepFieldError(msg);
      setMessage(msg);
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("You need to log in first.");
        setLoading(false);
        return;
      }

      const parsedMonthlyPaymentDay = 1;

      const depositMonths =
        depositType === "one_month" ? 1 : depositType === "two_months" ? 2 : 0;

      if (bookingUnit === "hour") {
        if (!pricePerHour || Number(pricePerHour) <= 0) {
          setMessage("Please enter a valid hourly price.");
          setLoading(false);
          return;
        }

        if (Number(minBookingHours || 0) < 1) {
          setMessage("Minimum booking hours must be at least 1.");
          setLoading(false);
          return;
        }
      }

      if (bookingUnit === "day") {
        if (!pricePerDay || Number(pricePerDay) <= 0) {
          setMessage("Please enter a valid daily price.");
          setLoading(false);
          return;
        }

        if (Number(minBookingDays || 0) < 1) {
          setMessage("Minimum booking days must be at least 1.");
          setLoading(false);
          return;
        }
      }

      if (bookingUnit === "month") {
        if (parsedMonthlyPaymentDay < 1 || parsedMonthlyPaymentDay > 28) {
          setMessage("Monthly payment day must be between 1 and 28.");
          setLoading(false);
          return;
        }

        if (!pricePerMonth || Number(pricePerMonth) <= 0) {
          setMessage("Please enter a valid monthly price.");
          setLoading(false);
          return;
        }

        if (Number(minBookingMonths || 0) < 1) {
          setMessage("Minimum booking months must be at least 1.");
          setLoading(false);
          return;
        }
      }

      const manualNorm = normalizeAdvisorCode(manualAdvisorCode);
      let advId: string | null = null;
      let advCode: string | null = null;
      let advSource: string | null = null;
      let advisorNote: string | null = null;

      if (manualNorm) {
        try {
          const lr = await fetch(
            `/api/advisor/lookup?code=${encodeURIComponent(manualNorm)}`
          );
          const lj = await lr.json().catch(() => null);
          const adv = (lj as { advisor?: { id: string; advisor_code: string } } | null)
            ?.advisor;
          if (lr.ok && adv?.id) {
            advId = adv.id;
            advCode = adv.advisor_code;
            advSource = "manual";
          } else {
            advisorNote =
              "That advisor code could not be verified — your listing will be created without it.";
          }
        } catch {
          advisorNote =
            "Advisor lookup failed — your listing will be created without that link.";
        }
      } else if (profileAdvisor?.advisor_id) {
        advId = profileAdvisor.advisor_id;
        advCode = profileAdvisor.advisor_code;
        advSource = profileAdvisor.advisor_source || "profile";
      } else {
        const pending = getPendingAdvisorCode();
        if (pending) {
          try {
            const lr = await fetch(
              `/api/advisor/lookup?code=${encodeURIComponent(pending)}`
            );
            const lj = await lr.json().catch(() => null);
            const adv = (lj as { advisor?: { id: string; advisor_code: string } } | null)
              ?.advisor;
            if (lr.ok && adv?.id) {
              advId = adv.id;
              advCode = adv.advisor_code;
              advSource = "link";
            } else {
              setPendingAdvisorCode(null);
              advisorNote =
                "Referral code could not be applied — you can add an advisor code above or continue without it.";
            }
          } catch {
            setPendingAdvisorCode(null);
            advisorNote =
              "Referral code could not be verified — continuing without advisor link.";
          }
        }
      }

      const spacePayload: SpaceInsertPayload = {
        owner_id: user.id,
        title,
        description,
        space_type: spaceType,
        booking_unit: bookingUnit,
        price_per_hour:
          bookingUnit === "hour" && pricePerHour ? Number(pricePerHour) : null,
        price_per_day:
          bookingUnit === "day" && pricePerDay ? Number(pricePerDay) : null,
        price_per_month:
          bookingUnit === "month" && pricePerMonth ? Number(pricePerMonth) : null,
        min_booking_hours:
          bookingUnit === "hour" ? Number(minBookingHours || 1) : null,
        min_booking_days:
          bookingUnit === "day" ? Number(minBookingDays || 1) : null,
        min_booking_months:
          bookingUnit === "month" ? Number(minBookingMonths || 1) : null,
        city,
        suburb,
        street_address: streetAddress,
        province: province,
        postal_code: postalCode,
        country: country || "South Africa",
        address_line_1: streetAddress,
        latitude,
        longitude,
        status: "pending",
        verification_status: "pending",
        ownership_proof_status: "pending",
        deposit_type: bookingUnit === "month" ? depositType : "none",
        deposit_months: bookingUnit === "month" ? depositMonths : 0,
        monthly_payment_day: bookingUnit === "month" ? parsedMonthlyPaymentDay : 1,
        deposit_required: bookingUnit === "month" && depositType !== "none",
        deposit_amount: null,
        ...(advId
          ? {
              advisor_id: advId,
              advisor_code: advCode,
              advisor_source: advSource,
            }
          : {}),
      };

      const { data, error: spaceError } = await supabase
        .from("spaces")
        .insert([spacePayload] as any)
        .select("id")
        .single();

      const insertedSpace = data as InsertedSpace | null;

      if (spaceError || !insertedSpace) {
        setMessage(spaceError?.message || "Could not create listing.");
        setLoading(false);
        return;
      }

      if (imageFiles.length > 0) {
        const imageRows: SpaceImageInsertRow[] = [];

        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          const fileExt = file.name.split(".").pop();
          const fileName = `${user.id}/${insertedSpace.id}-${Date.now()}-${i}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from("space-images")
            .upload(fileName, file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            setMessage(`Image upload failed: ${uploadError.message}`);
            setLoading(false);
            return;
          }

          const { data: publicUrlData } = supabase.storage
            .from("space-images")
            .getPublicUrl(fileName);

          imageRows.push({
            space_id: insertedSpace.id,
            image_url: publicUrlData.publicUrl,
            file_path: fileName,
            sort_order: i,
          });
        }

        const { error: imageInsertError } = await supabase
          .from("space_images")
          .insert(imageRows as any);

        if (imageInsertError) {
          setMessage(`Saving images failed: ${imageInsertError.message}`);
          setLoading(false);
          return;
        }
      }

      const attributeRows: SpaceAttributeInsertRow[] = Object.entries(attributes).flatMap(
        ([attributeKey, values]) =>
          values.map((value) => ({
            space_id: insertedSpace.id,
            attribute_key: attributeKey,
            attribute_value: value,
          }))
      );

      if (attributeRows.length > 0) {
        const { error: attributesError } = await supabase
          .from("space_attributes")
          .insert(attributeRows as any);

        if (attributesError) {
          setMessage(`Saving category details failed: ${attributesError.message}`);
          setLoading(false);
          return;
        }
      }

      const uploadedOwnership = await uploadPrivateFile(
        "listing-ownership",
        user.id,
        ownershipProofFile,
        `ownership-${insertedSpace.id}`
      );

      const ownershipRow: ListingOwnershipInsertRow = {
        space_id: insertedSpace.id,
        owner_id: user.id,
        document_type: "ownership_proof",
        file_url: uploadedOwnership.fileUrl,
        file_path: uploadedOwnership.filePath,
        status: "pending",
      };

      const { error: ownershipInsertError } = await supabase
        .from("listing_ownership_documents")
        .insert(ownershipRow as any);

      if (ownershipInsertError) {
        setMessage(`Saving ownership proof failed: ${ownershipInsertError.message}`);
        setLoading(false);
        return;
      }

      const intelSave = await upsertListingBookingIntelTables(supabase as any, {
        spaceId: insertedSpace.id,
        spaceType,
        questionnaireData: bookingIntelData,
        requirements: bookingRequirements,
      });
      if (intelSave.questionnaireError || intelSave.requirementsError) {
        setMessage(
          `Listing created, but booking quality could not be saved: ${
            intelSave.questionnaireError || intelSave.requirementsError
          }. Open Edit listing to try again.`
        );
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      await fetch("/api/notifications/listing-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          spaceId: insertedSpace.id,
          eventType: "listing_submitted",
        }),
      });

      setPendingAdvisorCode(null);
      clearSpaceFormDraft();

      setMomentumAdvisorNote(advisorNote);
      setSubmittedPhotoCount(imageFiles.length);
      setCreatedListingId(insertedSpace.id);
      setSubmitted(true);
      setMessage("");
      setLoading(false);
    } catch (error) {
      console.error(error);
      setSubmitted(false);
      setMessage("Something went wrong while creating the space.");
      setLoading(false);
    }
  }

  function fireOnCreated() {
    void onCreated?.();
  }

  async function copyListingShareLink() {
    if (!createdListingId || typeof window === "undefined") return;
    const url = `${window.location.origin}/spaces/${createdListingId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2200);
    } catch {
      setShareCopied(false);
    }
  }

  if (createdListingId) {
    return (
      <div className="overflow-x-hidden rounded-3xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 to-white p-6 shadow-[0_28px_65px_rgba(15,23,42,0.1)] sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80">
            <CheckCircle2 className="h-7 w-7" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold text-[#0f172a] sm:text-3xl">
              Your listing has been submitted
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#64748b]">
              It will appear to renters after review. What would you like to do next?
            </p>
          </div>
        </div>

        {momentumAdvisorNote ? (
          <p className="mb-5 rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            {momentumAdvisorNote}
          </p>
        ) : null}

        {submittedPhotoCount <= 2 && (
          <p className="mb-5 text-sm leading-relaxed text-[#64748b]">
            <span className="font-medium text-[#0f172a]">Tip:</span> listings with more photos tend
            to get more booking requests.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href={`/spaces/${createdListingId}`}
            onClick={fireOnCreated}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl bg-[#c1121f] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition hover:opacity-95"
          >
            View your listing
          </Link>

          <Link
            href={`/spaces/${createdListingId}/edit#booking-quality`}
            onClick={fireOnCreated}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl border border-[#d7dde3] bg-white px-4 py-3 text-center text-sm font-semibold text-[#334155] shadow-sm transition hover:border-[#b8c2cc]"
          >
            Refine booking quality in listing editor
          </Link>
          <p className="-mt-1 text-center text-xs text-[#64748b]">
            Or use the full-page questionnaire from your dashboard.
          </p>

          <Link
            href={`/spaces/${createdListingId}/edit`}
            onClick={fireOnCreated}
            className="flex w-full min-h-[48px] items-center justify-center rounded-xl border-2 border-[#0f172a] bg-white px-4 py-3 text-center text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fafc]"
          >
            Add more photos
          </Link>

          <button
            type="button"
            onClick={() => void copyListingShareLink()}
            className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#d7dde3] bg-white px-4 py-3 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc]"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden />
            {shareCopied ? "Link copied" : "Share listing link"}
          </button>

          <Link
            href="/dashboard/listings?created=pending"
            onClick={fireOnCreated}
            className="pt-1 text-center text-sm text-[#64748b] underline underline-offset-2 hover:text-[#0f172a]"
          >
            Manage in dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden rounded-3xl border border-[#e5e7eb] bg-white shadow-[0_28px_65px_rgba(15,23,42,0.12)]">
      <ListingFormStepNav
        steps={LISTING_CREATE_STEPS}
        currentStep={currentStep}
        maxUnlockedStep={maxUnlockedStep}
        onStepChange={handleStepNavClick}
      />
      <form onSubmit={handleCreateSpace} className="block">
        <div ref={stepContentAnchorRef} className="h-0 scroll-mt-[108px]" aria-hidden />
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
      {draftRestored && !draftBannerDismissed && (
        <div
          className="flex items-start gap-2 rounded-xl border border-sky-200/90 bg-sky-50/90 px-3 py-2.5 text-xs leading-snug text-sky-950 shadow-sm sm:text-sm"
          role="status"
        >
          <p className="min-w-0 flex-1">
            <span className="font-medium text-sky-950">We saved your progress.</span>{" "}
            Text fields were restored; add photos and ownership proof again if needed.
          </p>
          <button
            type="button"
            onClick={dismissDraftBanner}
            className="shrink-0 rounded-md p-1 text-sky-800 hover:bg-sky-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {draftSavedAt && !submitted ? (
        <p className="flex items-center justify-end gap-1.5 text-xs text-[#64748b]">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden />
          <span>
            Saved{" "}
            {Date.now() - draftSavedAt < 60_000
              ? "just now"
              : `${Math.round((Date.now() - draftSavedAt) / 60_000)} min ago`}
          </span>
        </p>
      ) : null}

      {stepFieldError ? (
        <div
          className="rounded-xl border border-red-200/90 bg-red-50/80 px-3 py-2 text-sm leading-snug text-red-900 shadow-sm"
          role="alert"
        >
          {stepFieldError}
        </div>
      ) : null}

      <div
        className={currentStep === 0 ? "listing-step-panel space-y-4" : "hidden"}
        aria-hidden={currentStep !== 0}
      >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2.5 sm:px-4">
        <p className="text-xs leading-snug text-[#64748b] sm:text-sm">
          Listings stay pending until identity, bank, and ownership proof are approved.
        </p>
        <Link
          href="/dashboard/verification?step=overview"
          className="shrink-0 text-sm font-medium text-[#c1121f] underline-offset-4 hover:underline"
        >
          Host dashboard
        </Link>
      </div>

      <section className="rounded-2xl border border-sky-200/80 bg-sky-50/70 p-4 shadow-sm sm:p-5">
        <h3 className="mb-0.5 text-sm font-semibold text-[#0f172a] sm:text-base">
          Space Advisor (optional)
        </h3>
        <p className="mb-2 text-xs leading-relaxed text-[#64748b] sm:text-sm">
          If a Space Advisor helped you set up this listing, enter their code here.
        </p>
        <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">
          Advisor code
        </label>
        <input
          type="text"
          value={manualAdvisorCode}
          onChange={(e) => setManualAdvisorCode(e.target.value.toUpperCase())}
          placeholder="e.g. SPACER1"
          className="w-full max-w-md rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm uppercase shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
          autoComplete="off"
        />
        <p className="mt-2 text-xs leading-relaxed text-[#64748b]">
          This helps us track who assisted you. It does not give them access to your
          account or payments.
        </p>
        {profileAdvisor?.advisor_code && !manualAdvisorCode.trim() && (
          <p className="mt-3 text-xs text-green-900">
            This listing will be linked to Space Advisor{" "}
            <strong>{profileAdvisor.advisor_code}</strong> (from your referral).
          </p>
        )}
        {!manualAdvisorCode.trim() &&
          !profileAdvisor?.advisor_id &&
          getPendingAdvisorCode() && (
            <p className="mt-3 text-xs text-green-900">
              Referral code <strong>{getPendingAdvisorCode()}</strong> will be
              applied to this listing.
            </p>
          )}
      </section>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
        <h3 className="mb-1 text-base font-semibold text-[#0f172a] sm:text-lg">
          Space basics
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-[#64748b] sm:text-sm">
          Name and describe your space. Type and pricing are set in the next section.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Secure parking bay in Paarl"
              className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2.5 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Covered parking with remote access"
              rows={3}
              className="w-full rounded-lg border border-[#d4dbe2] bg-white px-3 py-2.5 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
        <h3 className="mb-1 text-base font-semibold text-[#0f172a] sm:text-lg">
          Pricing &amp; booking rules
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-[#64748b] sm:text-sm">
          Space type, how renters book, your price, and minimum duration — one glance on larger screens.
        </p>

        {priceMissing ? (
          <p className="mb-3 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 sm:text-sm">
            Enter a valid price for the booking unit you selected.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3 xl:grid-cols-4">
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Space type</label>
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
              className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm font-medium text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
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
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Booking unit</label>
            <select
              value={bookingUnit}
              onChange={(e) => setBookingUnit(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm font-medium text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
            >
              <option value="hour">By hour</option>
              <option value="day">By day</option>
              <option value="month">By month</option>
            </select>
          </div>
          {bookingUnit === "hour" ? (
            <>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Price per hour</label>
                <input
                  type="number"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                  placeholder="50"
                  className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-[#c1121f]/20 ${
                    priceMissing
                      ? "border-amber-400 bg-amber-50/50 focus:border-amber-500"
                      : "border-[#d4dbe2] bg-white focus:border-[#c1121f]"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Minimum booking hours</label>
                <input
                  type="number"
                  min="1"
                  value={minBookingHours}
                  onChange={(e) => setMinBookingHours(e.target.value)}
                  placeholder="1"
                  className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                />
                <p className="mt-1 text-xs leading-snug text-[#64748b]">Minimum hours per booking.</p>
              </div>
            </>
          ) : null}
          {bookingUnit === "day" ? (
            <>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Price per day</label>
                <input
                  type="number"
                  value={pricePerDay}
                  onChange={(e) => setPricePerDay(e.target.value)}
                  placeholder="150"
                  className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-[#c1121f]/20 ${
                    priceMissing
                      ? "border-amber-400 bg-amber-50/50 focus:border-amber-500"
                      : "border-[#d4dbe2] bg-white focus:border-[#c1121f]"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Minimum booking days</label>
                <input
                  type="number"
                  min="1"
                  value={minBookingDays}
                  onChange={(e) => setMinBookingDays(e.target.value)}
                  placeholder="1"
                  className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                />
                <p className="mt-1 text-xs leading-snug text-[#64748b]">Minimum days per booking.</p>
              </div>
            </>
          ) : null}
          {bookingUnit === "month" ? (
            <>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Price per month</label>
                <input
                  type="number"
                  value={pricePerMonth}
                  onChange={(e) => setPricePerMonth(e.target.value)}
                  placeholder="2500"
                  className={`w-full min-h-[44px] rounded-lg border px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-[#c1121f]/20 ${
                    priceMissing
                      ? "border-amber-400 bg-amber-50/50 focus:border-amber-500"
                      : "border-[#d4dbe2] bg-white focus:border-[#c1121f]"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Minimum booking months</label>
                <input
                  type="number"
                  min="1"
                  value={minBookingMonths}
                  onChange={(e) => setMinBookingMonths(e.target.value)}
                  placeholder="1"
                  className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                />
                <p className="mt-1 text-xs leading-snug text-[#64748b]">Minimum months per booking.</p>
              </div>
            </>
          ) : null}
        </div>

        {bookingUnit === "hour" && pricePerHour && Number(pricePerHour) > 0 ? (() => {
          const breakdown = calculatePayoutBreakdown(Number(pricePerHour));
          return (
            <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm text-[#334155] sm:p-4">
              <p className="font-semibold text-[#0f172a]">Estimated payout breakdown</p>
              <div className="mt-2 space-y-0.5 text-sm">
                <p>Customer price: R{Number(pricePerHour).toFixed(2)}</p>
                <p>Payment fee (3.5%): -R{breakdown.paymentFee.toFixed(2)}</p>
                <p>Platform commission ({(getCommissionRate(bookingUnit) * 100).toFixed(0)}%): -R{breakdown.commission.toFixed(2)}</p>
                <p>VAT on commission (16%): -R{breakdown.vatOnCommission.toFixed(2)}</p>
                <p className="pt-1.5 font-semibold text-[#0f172a]">
                  You will receive approximately R{breakdown.payout.toFixed(2)}
                </p>
              </div>
            </div>
          );
        })() : null}

        {bookingUnit === "day" && pricePerDay && Number(pricePerDay) > 0 ? (() => {
          const breakdown = calculatePayoutBreakdown(Number(pricePerDay));
          return (
            <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm text-[#334155] sm:p-4">
              <p className="font-semibold text-[#0f172a]">Estimated payout breakdown</p>
              <div className="mt-2 space-y-0.5 text-sm">
                <p>Customer price: R{Number(pricePerDay).toFixed(2)}</p>
                <p>Payment fee (3.5%): -R{breakdown.paymentFee.toFixed(2)}</p>
                <p>Platform commission ({(getCommissionRate(bookingUnit) * 100).toFixed(0)}%): -R{breakdown.commission.toFixed(2)}</p>
                <p>VAT on commission (16%): -R{breakdown.vatOnCommission.toFixed(2)}</p>
                <p className="pt-1.5 font-semibold text-[#0f172a]">
                  You will receive approximately R{breakdown.payout.toFixed(2)}
                </p>
              </div>
            </div>
          );
        })() : null}

        {bookingUnit === "month" && pricePerMonth && Number(pricePerMonth) > 0 ? (() => {
          const breakdown = calculatePayoutBreakdown(Number(pricePerMonth));
          return (
            <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm text-[#334155] sm:p-4">
              <p className="font-semibold text-[#0f172a]">Estimated payout breakdown</p>
              <div className="mt-2 space-y-0.5 text-sm">
                <p>Customer price: R{Number(pricePerMonth).toFixed(2)}</p>
                <p>Payment fee (3.5%): -R{breakdown.paymentFee.toFixed(2)}</p>
                <p>Platform commission ({(getCommissionRate(bookingUnit) * 100).toFixed(0)}%): -R{breakdown.commission.toFixed(2)}</p>
                <p>VAT on commission (16%): -R{breakdown.vatOnCommission.toFixed(2)}</p>
                <p className="pt-1.5 font-semibold text-[#0f172a]">
                  You will receive approximately R{breakdown.payout.toFixed(2)} per month
                </p>
              </div>
            </div>
          );
        })() : null}

        {bookingUnit === "month" ? (
          <div className="mt-3 sm:mt-4 sm:max-w-md">
            <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Deposit type</label>
            <select
              value={depositType}
              onChange={(e) =>
                setDepositType(e.target.value as DepositType)
              }
              className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
            >
              <option value="none">No deposit</option>
              <option value="one_month">1 month deposit</option>
              <option value="two_months">2 months deposit</option>
            </select>
          </div>
        ) : null}
      </section>
      </div>

      <div
        className={currentStep === 1 ? "listing-step-panel space-y-4" : "hidden"}
        aria-hidden={currentStep !== 1}
      >
      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
        <h3 className="mb-1 text-base font-semibold text-[#0f172a] sm:text-lg">
          Location
        </h3>
        <p className="mb-4 text-xs leading-relaxed text-[#64748b] sm:text-sm">
          Add the address and pin the exact location on the map.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Street address</label>
            <div className="relative">
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => {
                  setStreetAddress(e.target.value);
                  setAddressSuggestionsOpen(true);
                }}
                onBlur={() => {
                  window.setTimeout(() => setAddressSuggestionsOpen(false), 140);
                }}
                onFocus={() => {
                  if (addressSuggestions.length > 0) setAddressSuggestionsOpen(true);
                }}
                placeholder="Enter street address (e.g. 42 Alma Road)"
                className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                autoComplete="street-address"
              />
              {addressSuggestionsOpen && addressSuggestions.length > 0 ? (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[#e5e7eb] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={`${suggestion.latitude}-${suggestion.longitude}-${idx}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setStreetAddress(suggestion.streetAddress || streetAddress);
                        if (!suburbTouched) setSuburb(suggestion.suburb || suburb);
                        if (!cityTouched) setCity(suggestion.city || city);
                        if (!provinceTouched) setProvince(suggestion.province || province);
                        if (!postalCodeTouched) setPostalCode(suggestion.postalCode || postalCode);
                        setCountry(suggestion.country || country);
                        setLatitude(suggestion.latitude);
                        setLongitude(suggestion.longitude);
                        setAddressSuggestionsOpen(false);
                        setMessage("Address selected from suggestions.");
                      }}
                      className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 last:border-b-0"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Start typing to see address suggestions or use the map.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Suburb</label>
              <input
                type="text"
                value={suburb}
                onChange={(e) => {
                  setSuburb(e.target.value);
                  setSuburbTouched(true);
                }}
                placeholder="e.g. Rosebank"
                className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                autoComplete="address-level2"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setCityTouched(true);
                }}
                placeholder="e.g. Cape Town"
                className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                autoComplete="address-level1"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Province</label>
              <select
                value={province}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setProvinceTouched(true);
                }}
                className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
              >
                <option value="">Select province</option>
                {ZA_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Postal code</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => {
                  setPostalCode(e.target.value);
                  setPostalCodeTouched(true);
                }}
                placeholder="e.g. 8001"
                className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                autoComplete="postal-code"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-medium leading-5 text-[#475569]">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
                autoComplete="country-name"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={searchAddressOnMap}
              disabled={searchingAddress || reverseGeocoding}
              className="rounded-full border border-[#d7dde3] bg-white px-4 py-2.5 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] disabled:opacity-60"
            >
              {searchingAddress ? "Finding..." : "Find address on map"}
            </button>

            <button
              type="button"
              onClick={useMyLocation}
              disabled={usingDeviceLocation || reverseGeocoding}
              className="rounded-full border border-[#d7dde3] bg-white px-4 py-2.5 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] disabled:opacity-60"
            >
              {usingDeviceLocation ? "Locating..." : "Use current location"}
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium leading-5 text-[#475569]">
              Pin your space on the map
            </label>
            <MapPicker
              latitude={latitude}
              longitude={longitude}
              onChange={async (lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
                await reverseGeocode(lat, lng, { forcePopulate: true });
              }}
            />
            <p className="mt-2 text-sm text-gray-600">
              Selected position: {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
            {reverseGeocoding ? (
              <p className="mt-1 text-xs text-gray-500">Updating address from map pin...</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
        <h3 className="mb-1 text-base font-semibold text-[#0f172a] sm:text-lg">
          Photos
        </h3>
        <p className="mb-3 text-xs leading-relaxed text-[#64748b] sm:text-sm">
          Upload clear images so renters can understand the space properly.
        </p>

        {imageFiles.length === 0 && (
          <p className="mb-3 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 sm:text-sm">
            Add at least 1 image — your listing needs photos to go live after approval.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium leading-5 text-[#475569]">Upload images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => addImageFiles(e.target.files)}
              className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
            />
            <p className="mt-1.5 text-xs text-[#64748b] sm:text-sm">
              {imageFiles.length} image{imageFiles.length === 1 ? "" : "s"} selected
            </p>
          </div>

          {imagePreviews.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[#0f172a]">Manage uploaded images</p>
                <label className="cursor-pointer rounded-full border border-[#d7dde3] bg-white px-3 py-2 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc]">
                  Add another picture
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => addImageFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {imagePreviews.map((item, index) => (
                  <div
                    key={`${item.file.name}-${index}`}
                    className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className="block w-full"
                    >
                      <Image
                        src={item.url}
                        alt={`Listing image ${index + 1}`}
                        width={400}
                        height={260}
                        className="h-40 w-full object-cover"
                        unoptimized
                      />
                    </button>

                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm text-gray-700">{item.file.name}</p>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveImage(index, -1)}
                          disabled={index === 0}
                          className="rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition hover:border-[#b8c2cc] disabled:opacity-40"
                        >
                          Move left
                        </button>

                        <button
                          type="button"
                          onClick={() => moveImage(index, 1)}
                          disabled={index === imagePreviews.length - 1}
                          className="rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] transition hover:border-[#b8c2cc] disabled:opacity-40"
                        >
                          Move right
                        </button>

                        <button
                          type="button"
                          onClick={() => removeImageAt(index)}
                          className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      </div>

      <div
        className={currentStep === 2 ? "listing-step-panel space-y-4" : "hidden"}
        aria-hidden={currentStep !== 2}
      >
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="border-b border-[#e5e7eb] bg-gradient-to-b from-[#fafbfc] to-white px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748b] sm:text-xs">
              Smart listing enhancement
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-[#0f172a] sm:text-xl">
              Features &amp; booking fit
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[#64748b] sm:text-sm">
              Help renters choose with confidence. These details feed the same quality score you&apos;ll see across
              FindMySpace — refine anytime from your dashboard.
            </p>
          </div>
          <div className="space-y-5 bg-[#fafbfc] px-4 py-4 sm:px-6 sm:py-5">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
              <SpaceCategoryFields
                embedded
                spaceType={spaceType}
                attributes={attributes}
                setAttributes={setAttributes}
              />
            </div>
            <div id="booking-quality" className="scroll-mt-24 space-y-4">
              <ListingQualityScoreSummary
                intelCategory={intelCategory}
                data={bookingIntelData}
                listingQualityOptions={listingQualityOptionsCreate}
                spaceTypeLabel={spaceType ? `Category: ${spaceType}` : undefined}
                compact
                footerHint="Saves automatically when you submit this listing."
              />
              <ListingBookingQualityFormFields
                embedded
                intelCategory={intelCategory}
                questionnaireData={bookingIntelData}
                onPatchSection={patchBookingIntelSection}
                onPatchRoot={patchBookingIntelRoot}
                requirements={bookingRequirements}
                onRequirementsChange={setBookingRequirements}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className={currentStep === 3 ? "listing-step-panel space-y-4" : "hidden"}
        aria-hidden={currentStep !== 3}
      >
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
          <h3 className="mb-1 text-base font-semibold text-[#0f172a] sm:text-lg">Review your listing</h3>
          <p className="mb-4 text-xs leading-relaxed text-[#64748b] sm:text-sm">
            Almost there — confirm the headline details, then publish for review when you&apos;re happy.
          </p>

          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
            <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="relative aspect-[4/3] w-full min-h-[200px] overflow-hidden bg-gray-200">
                {imagePreviews[0] ? (
                  <Image
                    src={imagePreviews[0].url}
                    alt=""
                    width={960}
                    height={720}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center text-sm text-gray-500">
                    Add a photo in the previous step to see your hero preview here.
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4 sm:p-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    Title
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#0f172a]">
                    {title.trim() || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    Price
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#c1121f]">{reviewPriceLabel}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    Location
                  </p>
                  <p className="mt-1 text-sm text-[#334155]">
                    {formatListingAddress({
                      street_address: streetAddress,
                      suburb,
                      city,
                      province,
                      postal_code: postalCode,
                      country,
                    }) || "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => goToListingStep(0)}
                    className="rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                  >
                    Edit basics
                  </button>
                  <button
                    type="button"
                    onClick={() => goToListingStep(1)}
                    className="rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                  >
                    Edit location &amp; photos
                  </button>
                  <button
                    type="button"
                    onClick={() => goToListingStep(2)}
                    className="rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
                  >
                    Edit features &amp; quality
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#fafbfc] p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Features summary</p>
              <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
                {featureSelectionCount > 0
                  ? `${featureSelectionCount} amenity or attribute selections`
                  : "No feature tags yet — optional but recommended."}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-[#fafbfc] p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Renter requirements</p>
              <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
                {renterRequirementsSummary.length > 0
                  ? renterRequirementsSummary.join(" · ")
                  : "No specific renter requirements selected."}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm sm:p-4">
            <ListingQualityScoreSummary
              intelCategory={intelCategory}
              data={bookingIntelData}
              listingQualityOptions={listingQualityOptionsCreate}
              spaceTypeLabel={spaceType ? `Category: ${spaceType}` : undefined}
              compact
            />
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-200/90 bg-emerald-50/70 p-4 shadow-sm">
            <p className="text-sm font-semibold text-emerald-950">Verification checklist</p>
            <ul className="mt-3 space-y-2.5 text-sm text-emerald-950">
              <li className="flex gap-2.5">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${title.trim() ? "text-emerald-600" : "text-gray-300"}`}
                  aria-hidden
                />
                <span>Clear listing title and description</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${!priceMissing ? "text-emerald-600" : "text-gray-300"}`}
                  aria-hidden
                />
                <span>Valid price for your booking unit</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    streetAddress.trim() &&
                    suburb.trim() &&
                    city.trim() &&
                    province.trim() &&
                    postalCode.trim() &&
                    country.trim()
                      ? "text-emerald-600"
                      : "text-gray-300"
                  }`}
                  aria-hidden
                />
                <span>Complete address and map pin</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    imageFiles.length >= 1 ? "text-emerald-600" : "text-gray-300"
                  }`}
                  aria-hidden
                />
                <span>At least one listing photo</span>
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    ownershipProofFile ? "text-emerald-600" : "text-gray-300"
                  }`}
                  aria-hidden
                />
                <span>Ownership proof uploaded for this space</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
          <h3 className="mb-1 text-base font-semibold text-[#0f172a] sm:text-lg">
            Proof you own or control this space
          </h3>
          <p className="mb-3 text-xs leading-relaxed text-[#64748b] sm:text-sm">
            This is specific to this listing. Your space will only go live once this ownership proof
            has been reviewed.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-medium leading-5 text-[#475569]">
              Proof of ownership for this space
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setOwnershipProofFile(e.target.files?.[0] || null)}
              className="w-full min-h-[44px] rounded-lg border border-[#d4dbe2] bg-white px-3 py-2 text-sm text-[#334155] shadow-sm outline-none transition-all duration-200 focus:border-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-[#64748b] sm:text-sm">
              {ownershipProofFile
                ? ownershipProofFile.name
                : "Upload a document proving ownership of this specific space."}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-1 flex flex-col gap-2 border-t border-[#e5e7eb] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {currentStep > 0 ? (
          <button
            type="button"
            onClick={goPrevStep}
            className="order-2 w-full min-h-[44px] rounded-xl border border-[#d7dde3] bg-white px-4 py-2.5 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] sm:order-1 sm:w-auto"
          >
            Back
          </button>
        ) : (
          <Link
            href="/dashboard/verification?step=overview"
            className="order-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#d7dde3] bg-white px-4 py-2.5 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc] sm:order-1"
          >
            Back to host dashboard
          </Link>
        )}
        <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row">
          {currentStep < LISTING_CREATE_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNextStep}
              className="w-full min-h-[44px] rounded-xl bg-[#c1121f] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] transition hover:opacity-95 sm:w-auto"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-xl bg-[#0f172a] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.2)] transition hover:opacity-95 disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Submitting listing..." : "Submit listing for review"}
            </button>
          )}
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-sm leading-relaxed text-[#334155]">
          {message}
        </div>
      ) : null}
        </div>
      </form>

      {previewIndex !== null && imagePreviews[previewIndex] ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <button
            type="button"
            onClick={() => setPreviewIndex(null)}
            className="absolute inset-0 cursor-default"
            aria-label="Close image preview"
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-[#e5e7eb] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Image preview
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#192a3a]">
                  {imagePreviews[previewIndex].file.name}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                className="rounded-xl border border-[#d7dde3] bg-white px-3 py-2 text-sm font-medium text-[#334155] shadow-sm transition hover:border-[#b8c2cc]"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              <Image
                src={imagePreviews[previewIndex].url}
                alt={`Preview ${previewIndex + 1}`}
                width={1400}
                height={900}
                className="max-h-[72vh] w-full object-contain"
                unoptimized
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}