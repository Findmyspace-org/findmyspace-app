"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  compressImageFile,
  isCompressibleImageFile,
} from "@/lib/image-compression-client";
import DayAvailabilityCalendar from "@/app/components/DayAvailabilityCalendar";
import AuthModal from "@/app/components/AuthModal";
import MonthAvailabilityCalendar from "@/app/components/MonthAvailabilityCalendar";
import HourAvailabilitySelector from "@/app/components/HourAvailabilitySelector";
import Link from "next/link";
import { Loader2, MapPin, X } from "lucide-react";
import {
  clearBookingDraft,
  draftMatchesSpace,
  normalizeBookingUnit,
  readBookingDraft,
  writeBookingDraft,
} from "@/lib/bookingDraftStorage";
import { isSpaceBookable } from "@/lib/listing-lifecycle";
import {
  ACCESS_FREQUENCY_OPTIONS,
  BookingRequestDetailPayload,
  DEFAULT_LISTING_BOOKING_REQUIREMENTS,
  ListingBookingRequirements,
  RENTER_ITEM_TYPE_OPTIONS,
} from "@/lib/booking-intelligence";
import { BookingRequirementFormFields } from "@/app/components/BookingRequirementFormFields";
import {
  propertyRequiresTermsAcceptance,
  type PropertyBookingTerms,
} from "@/lib/property-booking-terms";
import {
  type CustomFieldAnswerValue,
  type SpaceBookingRequirementField,
  validateCustomFieldAnswers,
} from "@/lib/space-booking-requirement-fields";
import { ExternalLink, FileText } from "lucide-react";

const STRUCTURED_BOOKING_VALIDATION_MESSAGE =
  "Please complete the required booking details before sending your request.";

type ExistingBooking = {
  id: string;
  booking_unit: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  payment_status?: string | null;
};

type BlockedDate = {
  id: string;
  space_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

function isBlockingOverlapStatus(
  status?: string | null,
  paymentStatus?: string | null
) {
  return (
    [
      "approved",
      "accepted_awaiting_payment",
      "awaiting_payment",
      "paid_confirmed",
      "confirmed",
      "completed",
    ].includes(status || "") || paymentStatus === "awaiting_payment"
  );
}

type BookingRequestFormProps = {
  spaceId: string;
  ownerId: string;
  bookingUnit: string | null;
  pricePerHour: number | null;
  pricePerDay: number | null;
  pricePerMonth: number | null;
  minHours?: number | null;
  minDays?: number | null;
  minMonths?: number | null;
  /** Single line for summary (address) */
  spaceLocation?: string;
};


type DepositType = "none" | "one_month" | "two_months";

type SpacePaymentSettings = {
  platform_fee_percent: number | null;
  deposit_type: DepositType | null;
  deposit_months: number | null;
  monthly_payment_day: number | null;
};


function buildUtcDateTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}


export default function BookingRequestForm({
  spaceId,
  ownerId,
  bookingUnit,
  pricePerHour,
  pricePerDay,
  pricePerMonth,
  minHours = null,
  minDays = null,
  minMonths = null,
  spaceLocation = "",
}: BookingRequestFormProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPropertyTerms, setAcceptedPropertyTerms] = useState(false);
  const [propertyTerms, setPropertyTerms] = useState<PropertyBookingTerms | null>(null);
  const [customRequirementFields, setCustomRequirementFields] = useState<
    SpaceBookingRequirementField[]
  >([]);
  const [prerequisitesLoading, setPrerequisitesLoading] = useState(true);
  const [customFieldAnswers, setCustomFieldAnswers] = useState<
    Record<string, CustomFieldAnswerValue>
  >({});
  const [customFieldFiles, setCustomFieldFiles] = useState<Record<string, File | null>>({});
  const [propertyTermsOpen, setPropertyTermsOpen] = useState(false);

  const [hourDate, setHourDate] = useState("");
  const [hourStart, setHourStart] = useState("");
  const [hourEnd, setHourEnd] = useState("");

  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");

  const [monthStart, setMonthStart] = useState("");
  const [monthEnd, setMonthEnd] = useState("");

  const [spaceSettings, setSpaceSettings] = useState<SpacePaymentSettings | null>(null);

  const [requestSentModalOpen, setRequestSentModalOpen] = useState(false);

  const [hostRequirements, setHostRequirements] =
    useState<ListingBookingRequirements | null>(null);
  const [hostRequirementsLoading, setHostRequirementsLoading] = useState(true);
  const [itemType, setItemType] = useState<string | null>(null);
  const [dimLength, setDimLength] = useState("");
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [accessFrequency, setAccessFrequency] = useState("");
  const [estimatedValueZar, setEstimatedValueZar] = useState("");
  const [structuredNotes, setStructuredNotes] = useState("");
  const [detailPhotoFiles, setDetailPhotoFiles] = useState<File[]>([]);

  const persistReadyRef = useRef(false);
  const unitKind = normalizeBookingUnit(bookingUnit);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const draft = readBookingDraft();
    if (draft && draftMatchesSpace(draft, spaceId, bookingUnit)) {
      setHourDate(draft.hourDate || "");
      setHourStart(draft.hourStart || "");
      setHourEnd(draft.hourEnd || "");
      setDayStart(draft.dayStart || "");
      setDayEnd(draft.dayEnd || "");
      setMonthStart(draft.monthStart || "");
      setMonthEnd(draft.monthEnd || "");
    }

    const sp = new URLSearchParams(window.location.search);
    if (unitKind === "hour") {
      const hd = sp.get("hd");
      const hs = sp.get("hs");
      const he = sp.get("he");
      if (hd) setHourDate(hd);
      if (hs) setHourStart(hs);
      if (he) setHourEnd(he);
    } else if (unitKind === "day") {
      const ds = sp.get("ds");
      const de = sp.get("de");
      if (ds) setDayStart(ds);
      if (de) setDayEnd(de);
    } else {
      const ms = sp.get("ms");
      const me = sp.get("me");
      if (ms) setMonthStart(ms);
      if (me) setMonthEnd(me);
    }

    persistReadyRef.current = true;
  }, [spaceId, bookingUnit, unitKind]);

  useEffect(() => {
    loadAvailabilityData();
    loadSpacePaymentSettings();
  }, [spaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrerequisites() {
      setPrerequisitesLoading(true);
      try {
        const res = await fetch(`/api/spaces/${spaceId}/booking-prerequisites`);
        if (!res.ok) {
          if (!cancelled) {
            setPropertyTerms(null);
            setCustomRequirementFields([]);
          }
          return;
        }
        const data = (await res.json()) as {
          property_terms: PropertyBookingTerms | null;
          fields: SpaceBookingRequirementField[];
        };
        if (cancelled) return;
        setPropertyTerms(data.property_terms);
        setCustomRequirementFields(data.fields || []);
      } catch (error) {
        console.warn("[FindMySpace] booking prerequisites load failed:", error);
        if (!cancelled) {
          setPropertyTerms(null);
          setCustomRequirementFields([]);
        }
      } finally {
        if (!cancelled) setPrerequisitesLoading(false);
      }
    }

    void loadPrerequisites();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadHostRequirements() {
      setHostRequirementsLoading(true);
      const { data, error } = await (supabase.from("listing_booking_requirements" as never) as any)
        .select(
          "require_item_type, require_dimensions, require_photos, require_vehicle_details, require_access_frequency, require_estimated_value, require_notes"
        )
        .eq("space_id", spaceId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn(
          "[FindMySpace] listing_booking_requirements load failed — check GRANT/RLS. Renter requirements may be hidden.",
          { spaceId, message: error.message, code: error.code }
        );
        setHostRequirements({ ...DEFAULT_LISTING_BOOKING_REQUIREMENTS });
        setHostRequirementsLoading(false);
        return;
      }

      if (data == null) {
        console.info(
          "[FindMySpace] No host booking requirements found for this listing.",
          { spaceId }
        );
        setHostRequirements({ ...DEFAULT_LISTING_BOOKING_REQUIREMENTS });
        setHostRequirementsLoading(false);
        return;
      }

      const next: ListingBookingRequirements = {
        require_item_type: Boolean(data.require_item_type),
        require_dimensions: Boolean(data.require_dimensions),
        require_photos: Boolean(data.require_photos),
        require_vehicle_details: Boolean(data.require_vehicle_details),
        require_access_frequency: Boolean(data.require_access_frequency),
        require_estimated_value: Boolean(data.require_estimated_value),
        require_notes: Boolean(data.require_notes),
      };

      if (process.env.NODE_ENV === "development" && Object.values(next).some(Boolean)) {
        console.debug("[FindMySpace] Host booking requirements loaded.", { spaceId, next });
      }

      setHostRequirements(next);
      setHostRequirementsLoading(false);
    }

    void loadHostRequirements();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const hostRequiresStructuredInfo = useMemo(() => {
    if (!hostRequirements) return false;
    return Object.values(hostRequirements).some(Boolean);
  }, [hostRequirements]);

  useEffect(() => {
    if (!persistReadyRef.current) return;

    const id = window.setTimeout(() => {
      writeBookingDraft({
        spaceId,
        bookingUnit: unitKind,
        hourDate,
        hourStart,
        hourEnd,
        dayStart,
        dayEnd,
        monthStart,
        monthEnd,
      });
    }, 400);

    return () => window.clearTimeout(id);
  }, [
    spaceId,
    unitKind,
    hourDate,
    hourStart,
    hourEnd,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !persistReadyRef.current) return;
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      ["hd", "hs", "he", "ds", "de", "ms", "me"].forEach((k) =>
        url.searchParams.delete(k)
      );
      if (unitKind === "hour") {
        if (hourDate) url.searchParams.set("hd", hourDate);
        if (hourStart) url.searchParams.set("hs", hourStart);
        if (hourEnd) url.searchParams.set("he", hourEnd);
      } else if (unitKind === "day") {
        if (dayStart) url.searchParams.set("ds", dayStart);
        if (dayEnd) url.searchParams.set("de", dayEnd);
      } else {
        if (monthStart) url.searchParams.set("ms", monthStart);
        if (monthEnd) url.searchParams.set("me", monthEnd);
      }
      const qs = url.searchParams.toString();
      const next = `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`;
      const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== cur) window.history.replaceState({}, "", next);
    }, 450);
    return () => window.clearTimeout(id);
  }, [
    unitKind,
    hourDate,
    hourStart,
    hourEnd,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
  ]);

  async function loadAvailabilityData() {
    setAvailabilityLoading(true);
    setStatusMessage("");
    const { data, error } = await supabase
      .from("bookings")
      .select("id, booking_unit, start_at, end_at, status, payment_status")
      .eq("space_id", spaceId)
      .order("start_at", { ascending: true });

    // console.log("PUBLIC bookings raw:", data);
    // console.log("PUBLIC bookings error:", error);

    if (error) {
      console.warn("Failed to load bookings:", error);
      setExistingBookings([]);
      // silently fail for public users; no blocking UI message
    } else {
      setExistingBookings((data || []) as ExistingBooking[]);
    }

    const { data: blockedData, error: blockedError } = await (supabase
      .from("blocked_dates") as any)
      .select("id, space_id, start_at, end_at, reason")
      .eq("space_id", spaceId)
      .order("start_at", { ascending: true });

    // console.log("PUBLIC blocked dates raw:", blockedData);
    // console.log("PUBLIC blocked dates error:", blockedError);

    if (blockedError) {
      console.warn("Failed to load blocked dates:", blockedError);
      setBlockedDates([]);
      // silently fail for blocked dates as well
    } else {
      setBlockedDates((blockedData || []) as BlockedDate[]);
    }
    setAvailabilityLoading(false);
  }

  async function loadSpacePaymentSettings() {
    const { data, error } = await (supabase.from("spaces") as any)
      .select("platform_fee_percent, deposit_type, deposit_months, monthly_payment_day")
      .eq("id", spaceId)
      .single();

    if (!error && data) {
      setSpaceSettings(data as SpacePaymentSettings);
    }
  }

  function getUnitPrice() {
    if (bookingUnit === "hour") return pricePerHour || 0;
    if (bookingUnit === "month") return pricePerMonth || 0;
    return pricePerDay || 0;
  }

  function getPriceLabel() {
    if (bookingUnit === "hour") {
      return pricePerHour ? `R${pricePerHour} / hour` : "Price not set";
    }

    if (bookingUnit === "month") {
      return pricePerMonth ? `R${pricePerMonth} / month` : "Price not set";
    }

    return pricePerDay ? `R${pricePerDay} / day` : "Price not set";
  }

  function getBusinessDateParts(value: string) {
    const date = new Date(value);

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes, fallback: string) =>
      Number(parts.find((part) => part.type === type)?.value || fallback);

    return {
      year: get("year", "0"),
      month: get("month", "1"),
      day: get("day", "1"),
    };
  }

  function toBusinessLocalDate(value: string) {
    const parts = getBusinessDateParts(value);
    return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  }

  function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
    // Normalize to business day boundaries (fix timezone shift issues)
    const normalize = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

    if (bookingUnit === "hour") {
      // keep exact precision for hours
      return startA < endB && endA > startB;
    }

    const aStart = normalize(startA);
    const aEnd = normalize(endA);
    const bStart = normalize(startB);
    const bEnd = normalize(endB);

    return aStart < bEnd && aEnd > bStart;
  }

  function buildRequestedRange() {
    let startAt = "";
    let endAt = "";

    if (bookingUnit === "hour") {
      if (!hourDate || !hourStart || !hourEnd) {
        return {
          startAt: "",
          endAt: "",
          error: "Please select a date and start/end times.",
        };
      }

      if (hourEnd <= hourStart) {
        return {
          startAt: "",
          endAt: "",
          error: "End time must be later than start time.",
        };
      }

      startAt = buildUtcDateTime(hourDate, hourStart).toISOString();
      endAt = buildUtcDateTime(hourDate, hourEnd).toISOString();

      return { startAt, endAt, error: "" };
    }

    if (bookingUnit === "month") {
      if (!monthStart || !monthEnd) {
        return {
          startAt: "",
          endAt: "",
          error: "Please select a start and end month.",
        };
      }

      if (monthEnd < monthStart) {
        return {
          startAt: "",
          endAt: "",
          error: "End month cannot be before start month.",
        };
      }

      const [startYear, startMonthValue] = monthStart.split("-").map(Number);
      const [endYear, endMonthValue] = monthEnd.split("-").map(Number);

      const startMonthUtc = new Date(
        Date.UTC(startYear, startMonthValue - 1, 1, 0, 0, 0, 0)
      );

      const endMonthUtcExclusive = new Date(
        Date.UTC(endYear, endMonthValue, 1, 0, 0, 0, 0)
      );

      startAt = startMonthUtc.toISOString();
      endAt = endMonthUtcExclusive.toISOString();
      return { startAt, endAt, error: "" };
    }

    if (!dayStart || !dayEnd) {
      return {
        startAt: "",
        endAt: "",
        error: "Please select a start and end date.",
      };
    }

    if (dayEnd < dayStart) {
      return {
        startAt: "",
        endAt: "",
        error: "End date cannot be before start date.",
      };
    }

    const [startYear, startMonth, startDay] = dayStart.split("-").map(Number);
    const [endYear, endMonth, endDay] = dayEnd.split("-").map(Number);

    const startDateUtc = new Date(
      Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0)
    );

    const endDateUtcExclusive = new Date(
      Date.UTC(endYear, endMonth - 1, endDay + 1, 0, 0, 0, 0)
    );

    startAt = startDateUtc.toISOString();
    endAt = endDateUtcExclusive.toISOString();

    return { startAt, endAt, error: "" };
  }

  function calculateQuantity(startAt: string, endAt: string) {
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return 0;

    const hours = diffMs / (1000 * 60 * 60);
    const days = diffMs / (1000 * 60 * 60 * 24);

    if (bookingUnit === "hour") {
      return Math.max(0.5, hours);
    }

    if (bookingUnit === "month") {
      const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonthExclusive = new Date(end.getFullYear(), end.getMonth(), 1);

      return Math.max(
        1,
        (endMonthExclusive.getFullYear() - startMonth.getFullYear()) * 12 +
        (endMonthExclusive.getMonth() - startMonth.getMonth())
      );
    }

    return Math.max(1, Math.round(days));
  }

  function getMinimumQuantity() {
    if (bookingUnit === "hour") return Number(minHours || 0);
    if (bookingUnit === "month") return Number(minMonths || 0);
    return Number(minDays || 0);
  }

  function getMinimumLabel(minimum: number) {
    if (minimum <= 0) return "";

    if (bookingUnit === "hour") {
      return `${minimum} hour${minimum === 1 ? "" : "s"}`;
    }

    if (bookingUnit === "month") {
      return `${minimum} month${minimum === 1 ? "" : "s"}`;
    }

    return `${minimum} day${minimum === 1 ? "" : "s"}`;
  }



  const liveConflictMessage = useMemo(() => {
    const { startAt, endAt, error } = buildRequestedRange();

    if (error || !startAt || !endAt) return "";

    const requestedStart = new Date(startAt);
    const requestedEnd = new Date(endAt);

    const blockingBookings = existingBookings.filter((booking) =>
      isBlockingOverlapStatus(booking.status, booking.payment_status)
    );

    const hasBookingConflict = blockingBookings.some((booking) =>
      overlaps(
        requestedStart,
        requestedEnd,
        toBusinessLocalDate(booking.start_at),
        toBusinessLocalDate(booking.end_at)
      )
    );

    const hasBlockedConflict = blockedDates.some((blocked) =>
      overlaps(
        requestedStart,
        requestedEnd,
        toBusinessLocalDate(blocked.start_at),
        toBusinessLocalDate(blocked.end_at)
      )
    );

    return hasBookingConflict || hasBlockedConflict
      ? "These dates or times are not available."
      : "";
  }, [
    bookingUnit,
    hourDate,
    hourStart,
    hourEnd,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
    existingBookings,
    blockedDates,
  ]);

  const liveMinimumMessage = useMemo(() => {
    const { startAt, endAt, error } = buildRequestedRange();
    const minimum = getMinimumQuantity();

    if (minimum <= 0 || error || !startAt || !endAt) return "";

    const quantity = calculateQuantity(startAt, endAt);
    if (quantity >= minimum) return "";

    return `This space has a minimum booking duration of ${getMinimumLabel(minimum)}.`;
  }, [
    bookingUnit,
    hourDate,
    hourStart,
    hourEnd,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
    minHours,
    minDays,
    minMonths,
  ]);

  const bookingSelectionComplete = useMemo(() => {
    if (bookingUnit === "hour") {
      return Boolean(hourDate && hourStart && hourEnd);
    }
    if (bookingUnit === "day") {
      return Boolean(dayStart && dayEnd);
    }
    if (bookingUnit === "month") {
      return Boolean(monthStart && monthEnd);
    }
    return false;
  }, [
    bookingUnit,
    hourDate,
    hourStart,
    hourEnd,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
  ]);

  const requiresPropertyTerms = useMemo(
    () => propertyRequiresTermsAcceptance(propertyTerms),
    [propertyTerms]
  );

  const hasCustomRequirements = customRequirementFields.length > 0;

  const requestButtonTitle = useMemo(() => {
    if (loading || availabilityLoading || hostRequirementsLoading || prerequisitesLoading) {
      return undefined;
    }
    if (liveConflictMessage || liveMinimumMessage) return undefined;
    if (!acceptedTerms) {
      return "Accept the platform terms and cancellation policy to continue";
    }
    if (requiresPropertyTerms && !acceptedPropertyTerms) {
      return "Accept the property terms and conditions to continue";
    }
    if (!bookingSelectionComplete) {
      if (bookingUnit === "hour") {
        return "Select a date and start and end times to continue";
      }
      if (bookingUnit === "day") {
        return "Select a start date and end date on the calendar to continue";
      }
      if (bookingUnit === "month") {
        return "Select start and end months to continue";
      }
    }
    return undefined;
  }, [
    loading,
    availabilityLoading,
    hostRequirementsLoading,
    prerequisitesLoading,
    liveConflictMessage,
    liveMinimumMessage,
    acceptedTerms,
    acceptedPropertyTerms,
    requiresPropertyTerms,
    bookingSelectionComplete,
    bookingUnit,
  ]);

  const bookingSummary = useMemo(() => {
    const { startAt, endAt, error } = buildRequestedRange();

    const unitPrice = getUnitPrice();
    const platformFeePercent = Number(spaceSettings?.platform_fee_percent ?? 15);
    const depositMonths = Number(spaceSettings?.deposit_months ?? 0);
    const monthlyPaymentDay = Number(spaceSettings?.monthly_payment_day ?? 1);

    if (error || !startAt || !endAt) {
      return {
        quantity: 0,
        unitPrice,
        totalPrice: 0,
        platformFeePercent,
        depositAmount: 0,
        initialPaymentAmount: 0,
        monthlyRent: bookingUnit === "month" ? unitPrice : 0,
        nextPaymentDate: null as string | null,
        monthsTotal: 0,
        monthsPaid: 0,
        monthlyPaymentDay,
      };
    }

    const quantity = calculateQuantity(startAt, endAt);

    if (bookingUnit === "month") {
      const monthlyRent = unitPrice;
      const depositAmount = Number((monthlyRent * depositMonths).toFixed(2));
      const initialPaymentAmount = Number(
        (monthlyRent + depositAmount).toFixed(2)
      );

      let nextPaymentDate: string | null = null;
      const startDate = new Date(startAt);
      const nextPayment = new Date(startDate);
      nextPayment.setMonth(nextPayment.getMonth() + 1);
      nextPayment.setDate(monthlyPaymentDay);
      nextPaymentDate = nextPayment.toISOString();

      return {
        quantity,
        unitPrice,
        totalPrice: initialPaymentAmount,
        platformFeePercent,
        depositAmount,
        initialPaymentAmount,
        monthlyRent,
        nextPaymentDate,
        monthsTotal: quantity,
        monthsPaid: quantity > 0 ? 1 : 0,
        monthlyPaymentDay,
      };
    }

    const totalPrice = Number((quantity * unitPrice).toFixed(2));

    return {
      quantity,
      unitPrice,
      totalPrice,
      platformFeePercent,
      depositAmount: 0,
      initialPaymentAmount: totalPrice,
      monthlyRent: 0,
      nextPaymentDate: null as string | null,
      monthsTotal: 0,
      monthsPaid: 0,
      monthlyPaymentDay,
    };
  }, [
    bookingUnit,
    hourDate,
    hourStart,
    hourEnd,
    dayStart,
    dayEnd,
    monthStart,
    monthEnd,
    pricePerHour,
    pricePerDay,
    pricePerMonth,
    spaceSettings,
  ]);

  function validateStructuredBookingFields(): string | null {
    const req = hostRequirements;
    if (!req) return null;
    if (req.require_item_type && !itemType) {
      return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
    }
    if (req.require_dimensions) {
      const l = Number(dimLength);
      const w = Number(dimWidth);
      const h = Number(dimHeight);
      if (
        !Number.isFinite(l) ||
        !Number.isFinite(w) ||
        !Number.isFinite(h) ||
        l <= 0 ||
        w <= 0 ||
        h <= 0
      ) {
        return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
      }
    }
    if (req.require_photos && detailPhotoFiles.length === 0) {
      return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
    }
    if (req.require_vehicle_details && !vehicleType.trim()) {
      return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
    }
    if (req.require_access_frequency && !accessFrequency) {
      return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
    }
    if (req.require_estimated_value) {
      const v = Number(estimatedValueZar);
      if (!Number.isFinite(v) || v <= 0) {
        return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
      }
    }
    if (req.require_notes && !structuredNotes.trim()) {
      return STRUCTURED_BOOKING_VALIDATION_MESSAGE;
    }
    return null;
  }

  function buildStructuredDetailPayload(photoUrls: string[]): BookingRequestDetailPayload {
    const out: BookingRequestDetailPayload = {};
    if (itemType) out.item_type = itemType;
    const l = Number(dimLength);
    const w = Number(dimWidth);
    const h = Number(dimHeight);
    if (
      Number.isFinite(l) &&
      Number.isFinite(w) &&
      Number.isFinite(h) &&
      (l > 0 || w > 0 || h > 0)
    ) {
      out.dimensions_cm = {
        length: l > 0 ? l : null,
        width: w > 0 ? w : null,
        height: h > 0 ? h : null,
      };
    }
    if (vehicleType.trim() || vehicleRegistration.trim()) {
      out.vehicle = {
        type: vehicleType.trim() || null,
        registration: vehicleRegistration.trim() || null,
      };
    }
    if (accessFrequency) out.access_frequency = accessFrequency;
    const ev = Number(estimatedValueZar);
    if (Number.isFinite(ev) && ev > 0) out.estimated_value_zar = ev;
    if (structuredNotes.trim()) out.notes = structuredNotes.trim();
    if (photoUrls.length > 0) out.photo_urls = photoUrls;
    return out;
  }

  async function uploadBookingDetailPhotos(
    userId: string,
    bookingId: string,
    files: File[]
  ) {
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const raw = files[i];
      const file = isCompressibleImageFile(raw)
        ? await compressImageFile(raw, "listing")
        : raw;
      const ext = file.name.split(".").pop() || "bin";
      const path = `${userId}/booking-request-${bookingId}-${Date.now()}-${i}.${ext}`;
      const { error } = await supabase.storage.from("space-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("space-images").getPublicUrl(path);
      urls.push(pub.publicUrl);
    }
    return urls;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage("");
    setLoading(true);

    try {
      if (!acceptedTerms) {
        setStatusMessage(
          "Please accept the platform Terms & Conditions and cancellation policy before booking."
        );
        setLoading(false);
        return;
      }

      if (requiresPropertyTerms && !acceptedPropertyTerms) {
        setStatusMessage("Please accept the property terms and conditions before booking.");
        setLoading(false);
        return;
      }

      const customFieldError = validateCustomFieldAnswers(
        customRequirementFields,
        customFieldAnswers,
        customFieldFiles
      );
      if (customFieldError) {
        setStatusMessage(customFieldError);
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        writeBookingDraft({
          spaceId,
          bookingUnit: unitKind,
          hourDate,
          hourStart,
          hourEnd,
          dayStart,
          dayEnd,
          monthStart,
          monthEnd,
        });
        setAuthMode("signup");
        setAuthModalOpen(true);
        setLoading(false);
        return;
      }

      if (user.id === ownerId) {
        setStatusMessage("You cannot book your own listing.");
        setLoading(false);
        return;
      }

      const { data: spaceStatusRow, error: spaceStatusError } = await (
        supabase.from("spaces") as any
      )
        .select("status, public_listing_mode")
        .eq("id", spaceId)
        .single();

      if (
        spaceStatusError ||
        !spaceStatusRow ||
        !isSpaceBookable(spaceStatusRow as {
          status: string | null;
          public_listing_mode: string | null;
        })
      ) {
        setStatusMessage("This listing is not available for booking.");
        setLoading(false);
        return;
      }

      const { startAt, endAt, error } = buildRequestedRange();

      if (error) {
        setStatusMessage(error);
        setLoading(false);
        return;
      }

      const requestedStart = new Date(startAt);
      const requestedEnd = new Date(endAt);

      const blockingBookings = existingBookings.filter((booking) =>
        isBlockingOverlapStatus(booking.status, booking.payment_status)
      );

      const hasBookingConflict = blockingBookings.some((booking) =>
        overlaps(
          requestedStart,
          requestedEnd,
          toBusinessLocalDate(booking.start_at),
          toBusinessLocalDate(booking.end_at)
        )
      );

      const hasBlockedConflict = blockedDates.some((blocked) =>
        overlaps(
          requestedStart,
          requestedEnd,
          toBusinessLocalDate(blocked.start_at),
          toBusinessLocalDate(blocked.end_at)
        )
      );

      if (hasBookingConflict || hasBlockedConflict) {
        setStatusMessage("Those dates or times are not available.");
        setLoading(false);
        return;
      }

      const quantity = calculateQuantity(startAt, endAt);
      const unitPrice = getUnitPrice();

      if (quantity <= 0) {
        setStatusMessage("Please choose a valid booking period.");
        setLoading(false);
        return;
      }
      const minimum = getMinimumQuantity();
      if (minimum > 0 && quantity < minimum) {
        setStatusMessage(
          `This space has a minimum booking duration of ${getMinimumLabel(minimum)}.`
        );
        setLoading(false);
        return;
      }

      if (unitPrice <= 0) {
        setStatusMessage("This listing does not have valid pricing yet.");
        setLoading(false);
        return;
      }

      const structuredError = validateStructuredBookingFields();
      if (structuredError) {
        setStatusMessage(structuredError);
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setStatusMessage("Please sign in again to continue.");
        setLoading(false);
        return;
      }

      const requestFormData = new FormData();
      requestFormData.append(
        "payload",
        JSON.stringify({
          spaceId,
          ownerId,
          bookingUnit: bookingUnit || "day",
          startAt,
          endAt,
          notes: structuredNotes.trim() ? structuredNotes.trim() : null,
          acceptedPropertyTerms: requiresPropertyTerms ? acceptedPropertyTerms : false,
          requirementAnswers: customFieldAnswers,
        } satisfies {
          spaceId: string;
          ownerId: string;
          bookingUnit: string;
          startAt: string;
          endAt: string;
          notes: string | null;
          acceptedPropertyTerms: boolean;
          requirementAnswers: Record<string, CustomFieldAnswerValue>;
        })
      );

      for (const field of customRequirementFields) {
        if (field.field_type !== "file_upload") continue;
        const file = customFieldFiles[field.id];
        if (file) {
          requestFormData.append(`file_${field.id}`, file);
        }
      }

      const requestRes = await fetch("/api/bookings/request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: requestFormData,
      });

      const requestJson = (await requestRes.json().catch(() => null)) as {
        bookingId?: string;
        error?: string;
      } | null;

      if (!requestRes.ok || !requestJson?.bookingId) {
        setStatusMessage(requestJson?.error || "Could not send booking request.");
        setLoading(false);
        return;
      }

      const insertedBooking = { id: requestJson.bookingId };

      if (insertedBooking?.id) {
        let photoUrls: string[] = [];
        if (detailPhotoFiles.length > 0) {
          try {
            photoUrls = await uploadBookingDetailPhotos(
              user.id,
              insertedBooking.id,
              detailPhotoFiles
            );
          } catch (uploadErr) {
            console.error("booking detail photos:", uploadErr);
          }
        }

        const detailPayload = buildStructuredDetailPayload(photoUrls);
        const persistDetails =
          hostRequiresStructuredInfo || Object.keys(detailPayload).length > 0;
        if (persistDetails) {
          const { error: detailError } = await (supabase.from("booking_request_details" as never) as any)
            .insert({
              booking_id: insertedBooking.id,
              data: detailPayload,
            });
          if (detailError) {
            console.error("booking_request_details insert:", detailError);
          }
        }

        try {
          await fetch("/api/notifications/booking-event", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bookingId: insertedBooking.id,
              eventType: "booking_request_created",
            }),
          });
        } catch (error) {
          console.error("Could not send booking email:", error);
        }
      }

      // 🔥 CLEAN RESET
      clearBookingDraft();
      setHourDate("");
      setHourStart("");
      setHourEnd("");
      setDayStart("");
      setDayEnd("");
      setMonthStart("");
      setMonthEnd("");
      setAcceptedTerms(false);
      setAcceptedPropertyTerms(false);
      setCustomFieldAnswers({});
      setCustomFieldFiles({});
      setItemType(null);
      setDimLength("");
      setDimWidth("");
      setDimHeight("");
      setVehicleType("");
      setVehicleRegistration("");
      setAccessFrequency("");
      setEstimatedValueZar("");
      setStructuredNotes("");
      setDetailPhotoFiles([]);

      setStatusMessage("");
      setRequestSentModalOpen(true);

      await loadAvailabilityData();
      setLoading(false);
    } catch {
      setStatusMessage("Something went wrong while sending the booking request.");
      setLoading(false);
    }
  }

  function handleCloseRequestSentModal() {
    setRequestSentModalOpen(false);
  }

  return (
    <>
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-3 text-2xl font-semibold text-[#192a3a]">
          Book this space
        </h2>

        {spaceLocation ? (
          <p className="mb-2 flex gap-2 text-sm text-gray-800">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            <span>{spaceLocation}</span>
          </p>
        ) : null}

        <p className="mb-4 rounded-md border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950">
          Secure booking — no payment until the host approves your request. After approval,
          you can pay to confirm your dates.
        </p>

        <p className="mb-2 text-sm text-gray-600">
          Booking type: <span className="font-medium">{bookingUnit || "day"}</span>
        </p>

        <p className="mb-2 text-sm text-gray-600">
          Price: <span className="font-medium">{getPriceLabel()}</span>
        </p>
        {getMinimumQuantity() > 0 && (
          <p className="mb-2 text-sm text-gray-600">
            Minimum booking:{" "}
            <span className="font-medium">{getMinimumLabel(getMinimumQuantity())}</span>
          </p>
        )}

        {bookingSelectionComplete && (
          <p className="mb-3 text-sm font-medium text-[#192a3a]">
            {unitKind === "hour" && hourDate && `${hourDate} · ${hourStart}–${hourEnd}`}
            {unitKind === "day" && dayStart && dayEnd && `${dayStart} → ${dayEnd}`}
            {unitKind === "month" &&
              monthStart &&
              monthEnd &&
              `${monthStart} → ${monthEnd}`}
          </p>
        )}

        {bookingSummary.quantity > 0 && bookingSummary.unitPrice > 0 && (
          <div className="mb-6 rounded-md border border-gray-200 bg-[#f8fafb] p-4 text-sm text-gray-700">
            {bookingUnit === "month" ? (
              <>
                <p>
                  <b>Monthly rent:</b> R{bookingSummary.monthlyRent.toFixed(2)}
                </p>
                <p>
                  <b>Deposit:</b>{" "}
                  {spaceSettings?.deposit_type === "one_month"
                    ? "1 month"
                    : spaceSettings?.deposit_type === "two_months"
                      ? "2 months"
                      : "None"}{" "}
                  (R{bookingSummary.depositAmount.toFixed(2)})
                </p>
                <p>
                  <b>Months booked:</b> {bookingSummary.monthsTotal}
                </p>
                <p>
                  <b>First payment due now:</b> R
                  {bookingSummary.initialPaymentAmount.toFixed(2)}
                </p>
                {bookingSummary.nextPaymentDate && (
                  <p>
                    <b>Next payment date:</b>{" "}
                    {new Date(bookingSummary.nextPaymentDate).toLocaleDateString()}
                  </p>
                )}
                <p className="mt-2 text-base font-semibold text-[#192a3a]">
                  Initial total: R{bookingSummary.totalPrice.toFixed(2)}
                </p>
              </>
            ) : (
              <>
                <p>
                  <b>Unit price:</b> R{bookingSummary.unitPrice}
                </p>
                <p>
                  <b>Quantity:</b>{" "}
                  {bookingUnit === "hour"
                    ? `${bookingSummary.quantity} hour${bookingSummary.quantity === 1 ? "" : "s"
                    }`
                    : bookingSummary.quantity}
                </p>
                <p className="mt-2 text-base font-semibold text-[#192a3a]">
                  Total: R{bookingSummary.totalPrice.toFixed(2)}
                </p>
              </>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-busy={loading || availabilityLoading}
        >
          {availabilityLoading && (
            <div
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-[#f8fafb] px-3 py-2.5 text-sm text-gray-600"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#192a3a]" aria-hidden />
              Loading availability…
            </div>
          )}

          {(bookingUnit === "hour" || bookingUnit === "day") && (
            <div className="rounded-md border border-gray-200 bg-[#f4f7f9] px-3 py-2.5 text-xs leading-relaxed text-gray-700">
              <span className="font-semibold text-[#192a3a]">Booking steps:</span>{" "}
              {bookingUnit === "hour" ? (
                <>
                  choose a date, pick start and end times, accept the terms, then tap Request booking.
                </>
              ) : (
                <>
                  pick a start date and an end date on the calendar, accept the terms, then tap Request
                  booking.
                </>
              )}
            </div>
          )}

          {bookingUnit === "hour" && (
            <>
              <div className="rounded-lg border-2 border-gray-300 bg-white p-4 shadow-sm">
                <label
                  htmlFor="booking-hour-date"
                  className="mb-1 block text-sm font-semibold text-[#192a3a]"
                >
                  Date <span className="text-red-600">*</span>
                </label>
                <p className="mb-3 text-xs text-gray-600">
                  Select a date to load available hours for that day.
                </p>
                <input
                  id="booking-hour-date"
                  type="date"
                  value={hourDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    const next = e.target.value;
                    setHourDate((prev) => {
                      if (prev !== next) {
                        setHourStart("");
                        setHourEnd("");
                      }
                      return next;
                    });
                  }}
                  className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-3 text-base font-medium text-[#192a3a] shadow-inner focus:border-[#192a3a] focus:outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                  aria-required="true"
                  aria-describedby={!hourDate ? "booking-hour-date-hint" : undefined}
                />
                {!hourDate && (
                  <p
                    id="booking-hour-date-hint"
                    className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                  >
                    Select a date — times appear below once a day is chosen.
                  </p>
                )}
              </div>

              {hourDate && (
                <HourAvailabilitySelector
                  selectedDate={hourDate}
                  existingBookings={existingBookings}
                  blockedDates={blockedDates}
                  onChange={(start, end) => {
                    const nextStart = start ? start.slice(11, 16) : "";
                    const nextEnd = end ? end.slice(11, 16) : "";

                    setHourStart(nextStart);
                    setHourEnd(nextEnd);
                  }}
                />
              )}
            </>
          )}

          {bookingUnit === "day" && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#192a3a]">
                Stay dates <span className="text-red-600">*</span>
              </p>
              <p className="text-xs text-gray-600">
                Tap a start date on the calendar, then tap an end date. Both are required before you can
                request a booking.
              </p>
              <DayAvailabilityCalendar
                existingBookings={existingBookings}
                blockedDates={blockedDates}
                dayStart={dayStart}
                dayEnd={dayEnd}
                onChange={(start, end) => {
                  setDayStart(start);
                  setDayEnd(end);
                }}
              />
            </div>
          )}

          {bookingUnit === "month" && (
            <MonthAvailabilityCalendar
              existingBookings={existingBookings}
              blockedDates={blockedDates}
              monthStart={monthStart}
              monthEnd={monthEnd}
              onChange={(start, end) => {
                setMonthStart(start);
                setMonthEnd(end);
              }}
            />
          )}

          {liveConflictMessage && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="status"
            >
              {liveConflictMessage}
            </div>
          )}
          {liveMinimumMessage && (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              role="status"
            >
              {liveMinimumMessage}
            </div>
          )}

          {prerequisitesLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-600" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#192a3a]" aria-hidden />
              Loading booking requirements…
            </div>
          )}

          {!prerequisitesLoading && hasCustomRequirements ? (
            <BookingRequirementFormFields
              fields={customRequirementFields}
              answers={customFieldAnswers}
              files={customFieldFiles}
              disabled={loading}
              onAnswerChange={(fieldId, value) =>
                setCustomFieldAnswers((prev) => ({ ...prev, [fieldId]: value }))
              }
              onFileChange={(fieldId, file) =>
                setCustomFieldFiles((prev) => ({ ...prev, [fieldId]: file }))
              }
            />
          ) : null}

          {!prerequisitesLoading && requiresPropertyTerms && propertyTerms ? (
            <div className="rounded-md border border-gray-200 bg-[#f8fafb] p-3 text-xs text-gray-600">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="font-medium text-[#192a3a]">
                  {propertyTerms.terms_title || "Property terms and conditions"}
                </p>
                <button
                  type="button"
                  onClick={() => setPropertyTermsOpen(true)}
                  className="inline-flex items-center gap-1 text-[#192a3a] underline"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  View terms
                </button>
                {propertyTerms.terms_document_url ? (
                  <a
                    href={propertyTerms.terms_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#192a3a] underline"
                  >
                    Open document
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </div>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acceptedPropertyTerms}
                  onChange={(e) => setAcceptedPropertyTerms(e.target.checked)}
                  disabled={loading}
                  className="mt-0.5"
                />
                <span>{propertyTerms.terms_acceptance_label}</span>
              </label>
            </div>
          ) : null}

          {hostRequirementsLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-600" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#192a3a]" aria-hidden />
              Loading host requirements…
            </div>
          )}

          {hostRequiresStructuredInfo && !hostRequirementsLoading && (
            <div className="space-y-4 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.03] sm:p-5">
              <div>
                <h3 className="text-base font-semibold text-[#192a3a]">
                  This host needs a few details before approving
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                  Better details help the host approve your request faster.
                </p>
              </div>

              {hostRequirements?.require_item_type && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">
                    What are you storing, parking, or using? <span className="text-red-600">*</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {RENTER_ITEM_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setItemType((prev) => (prev === opt.value ? null : opt.value))
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          itemType === opt.value
                            ? "bg-[#192a3a] text-white"
                            : "border border-[#e2e8f0] bg-white text-[#192a3a] hover:bg-[#f8fafb]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hostRequirements?.require_dimensions && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">
                    Dimensions (cm) <span className="text-red-600">*</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Length"
                      value={dimLength}
                      onChange={(e) => setDimLength(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Width"
                      value={dimWidth}
                      onChange={(e) => setDimWidth(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Height"
                      value={dimHeight}
                      onChange={(e) => setDimHeight(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                    />
                  </div>
                </div>
              )}

              {hostRequirements?.require_vehicle_details && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Vehicle type <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                      placeholder="e.g. SUV, trailer"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Registration (optional)
                    </label>
                    <input
                      type="text"
                      value={vehicleRegistration}
                      onChange={(e) => setVehicleRegistration(e.target.value)}
                      className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                    />
                  </div>
                </div>
              )}

              {hostRequirements?.require_photos && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">
                    Upload photos of what you want to store, park or use{" "}
                    <span className="text-red-600">*</span>
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) =>
                      setDetailPhotoFiles(Array.from(e.target.files || []))
                    }
                    className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#192a3a] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                  />
                  {detailPhotoFiles.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {detailPhotoFiles.length} file{detailPhotoFiles.length === 1 ? "" : "s"}{" "}
                      selected
                    </p>
                  )}
                </div>
              )}

              {hostRequirements?.require_access_frequency && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Access frequency <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={accessFrequency}
                    onChange={(e) => setAccessFrequency(e.target.value)}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                  >
                    <option value="">Select…</option>
                    {ACCESS_FREQUENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {hostRequirements?.require_estimated_value && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Estimated value (ZAR) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={estimatedValueZar}
                    onChange={(e) => setEstimatedValueZar(e.target.value)}
                    className="w-full max-w-xs rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                  />
                </div>
              )}

              {hostRequirements?.require_notes && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Additional notes <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={structuredNotes}
                    onChange={(e) => setStructuredNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20"
                    placeholder="Anything else the host should know…"
                  />
                </div>
              )}

              <p className="text-[10px] leading-relaxed text-gray-500">
                {/* TODO: AI assistant integration — pre-validate renter answers against listing_questionnaires. */}
                Your answers are stored with your booking request for the host to review.
              </p>
            </div>
          )}

          <div className="rounded-md border border-gray-200 bg-[#f8fafb] p-3 text-xs text-gray-600">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                disabled={loading}
                className="mt-0.5"
              />
              <span>
                I agree to the{" "}
                <a href="/terms" className="underline text-[#192a3a]">
                  FindMySpace Terms &amp; Conditions
                </a>{" "}
                and the cancellation policy.
              </span>
            </label>
          </div>

          {statusMessage && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {statusMessage}
            </div>
          )}

          <button
            type="submit"
            title={requestButtonTitle}
            disabled={
              loading ||
              availabilityLoading ||
              hostRequirementsLoading ||
              prerequisitesLoading ||
              Boolean(liveConflictMessage) ||
              Boolean(liveMinimumMessage) ||
              !acceptedTerms ||
              (requiresPropertyTerms && !acceptedPropertyTerms) ||
              !bookingSelectionComplete
            }
            className="inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-md bg-[#192a3a] px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sending request…
              </>
            ) : (
              "Request booking"
            )}
          </button>
          <p className="text-center text-xs text-gray-500">
            After the host approves, you&apos;ll complete payment to lock in your booking.
          </p>
        </form>
      </div>

      {propertyTermsOpen && propertyTerms ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={() => setPropertyTermsOpen(false)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Property terms and conditions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPropertyTermsOpen(false)}
              className="absolute right-3 top-3 rounded-md p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <h3 className="pr-10 text-lg font-semibold text-[#192a3a]">
              {propertyTerms.terms_title || "Property terms and conditions"}
            </h3>
            {propertyTerms.terms_text ? (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {propertyTerms.terms_text}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-600">
                No text terms were provided. Please review the linked document if available.
              </p>
            )}
            {propertyTerms.terms_document_url ? (
              <a
                href={propertyTerms.terms_document_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#192a3a] underline"
              >
                Open terms document
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {requestSentModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="presentation"
          onClick={handleCloseRequestSentModal}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 pt-12 text-left shadow-xl sm:p-8 sm:pt-14"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-request-sent-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseRequestSentModal}
              className="absolute right-3 top-3 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <h3
              id="booking-request-sent-title"
              className="text-xl font-semibold text-[#192a3a] sm:text-2xl"
            >
              Request sent
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              The owner will review your request. You&apos;ll be notified as soon as they
              respond.
            </p>
            <p className="mt-3 rounded-md border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950">
              No payment is required until the booking is accepted.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/dashboard/my-bookings"
                className="flex w-full min-h-[48px] items-center justify-center rounded-md bg-[#192a3a] px-4 py-3 text-center text-sm font-semibold text-white hover:opacity-95"
              >
                View your bookings
              </Link>
              <Link
                href="/spaces"
                className="flex w-full min-h-[48px] items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-center text-sm font-medium text-[#192a3a] hover:bg-gray-50"
              >
                Continue browsing
              </Link>
            </div>
          </div>
        </div>
      )}

      <AuthModal
        open={authModalOpen}
        mode={authMode}
        nextPath={`/spaces/${spaceId}?book=1`}
        onClose={() => setAuthModalOpen(false)}
        onSwitchMode={(nextMode: "login" | "signup") =>
          setAuthMode(nextMode)
        }
      />
    </>
  );
}