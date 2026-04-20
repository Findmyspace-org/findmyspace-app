"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buildInitialBookingCharges } from "@/lib/invoice";
import DayAvailabilityCalendar from "@/app/components/DayAvailabilityCalendar";
import AuthModal from "@/app/components/AuthModal";
import MonthAvailabilityCalendar from "@/app/components/MonthAvailabilityCalendar";
import HourAvailabilitySelector from "@/app/components/HourAvailabilitySelector";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  clearBookingDraft,
  draftMatchesSpace,
  normalizeBookingUnit,
  readBookingDraft,
  writeBookingDraft,
} from "@/lib/bookingDraftStorage";

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
}: BookingRequestFormProps) {
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [existingBookings, setExistingBookings] = useState<ExistingBooking[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [hourDate, setHourDate] = useState("");
  const [hourStart, setHourStart] = useState("");
  const [hourEnd, setHourEnd] = useState("");

  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");

  const [monthStart, setMonthStart] = useState("");
  const [monthEnd, setMonthEnd] = useState("");

  const [spaceSettings, setSpaceSettings] = useState<SpacePaymentSettings | null>(null);

  const router = useRouter();
  const [requestSentModalOpen, setRequestSentModalOpen] = useState(false);

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

    persistReadyRef.current = true;
  }, [spaceId, bookingUnit]);

  useEffect(() => {
    loadAvailabilityData();
    loadSpacePaymentSettings();
  }, [spaceId]);

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

    return `Minimum booking is ${getMinimumLabel(minimum)}.`;
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

  const requestButtonTitle = useMemo(() => {
    if (loading || availabilityLoading) return undefined;
    if (liveConflictMessage || liveMinimumMessage) return undefined;
    if (!acceptedTerms) {
      return "Accept the terms and cancellation policy to continue";
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
    liveConflictMessage,
    liveMinimumMessage,
    acceptedTerms,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage("");
    setLoading(true);

    try {
      if (!acceptedTerms) {
        setStatusMessage(
          "Please accept the Terms & Conditions and cancellation policy before booking."
        );
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
        setStatusMessage(`Minimum booking is ${getMinimumLabel(minimum)}.`);
        setLoading(false);
        return;
      }

      if (unitPrice <= 0) {
        setStatusMessage("This listing does not have valid pricing yet.");
        setLoading(false);
        return;
      }

      // 🔥 LOAD SETTINGS (single source of truth)
      const { data: settingsData } = await (supabase.from("spaces") as any)
        .select("platform_fee_percent, deposit_type, deposit_months, monthly_payment_day")
        .eq("id", spaceId)
        .single();

      const paymentSettings = settingsData as SpacePaymentSettings;

      const platformFeePercent = Number(paymentSettings?.platform_fee_percent ?? 15);
      const depositMonths = Number(paymentSettings?.deposit_months ?? 0);
      const monthlyPaymentDay = Number(paymentSettings?.monthly_payment_day ?? 1);

      let totalPrice = Number((quantity * unitPrice).toFixed(2));
      let depositAmount = 0;
      let monthlyRent = 0;
      let initialPaymentAmount = totalPrice;
      let nextPaymentDate: string | null = null;
      let monthsTotal = 0;
      let monthsPaid = 0;

      if (bookingUnit === "month") {
        monthlyRent = unitPrice;
        monthsTotal = quantity;

        depositAmount = Number((monthlyRent * depositMonths).toFixed(2));
        initialPaymentAmount = Number((monthlyRent + depositAmount).toFixed(2));

        totalPrice = initialPaymentAmount;
        monthsPaid = 1;

        const startDate = new Date(startAt);
        const nextPayment = new Date(startDate);
        nextPayment.setMonth(nextPayment.getMonth() + 1);
        nextPayment.setDate(monthlyPaymentDay);

        nextPaymentDate = nextPayment.toISOString();
      }

      const platformFee = Number(
        (totalPrice * (platformFeePercent / 100)).toFixed(2)
      );

      const ownerAmount = Number((totalPrice - platformFee).toFixed(2));

      // ✅ CLEAN STATUS MODEL
      const insertRow = {
        space_id: spaceId,
        renter_id: user.id,
        owner_id: ownerId,
        booking_unit: bookingUnit || "day",
        start_at: startAt,
        end_at: endAt,

        total_price: totalPrice,
        platform_fee: platformFee,
        owner_earnings: ownerAmount,

        status: "pending_owner",              // 🔥 FIXED
        payment_status: "unpaid",
        payout_status: "unpaid_to_owner",

        notes: null,

        // monthly fields
        monthly_rent: bookingUnit === "month" ? monthlyRent : null,
        deposit_amount: bookingUnit === "month" ? depositAmount : null,
        initial_payment_amount:
          bookingUnit === "month" ? initialPaymentAmount : null,
        next_payment_date: bookingUnit === "month" ? nextPaymentDate : null,
        months_total: bookingUnit === "month" ? monthsTotal : null,
        months_paid: bookingUnit === "month" ? monthsPaid : null,
      };

      const { data: insertedBooking, error: insertError } = await (supabase
        .from("bookings") as any)
        .insert(insertRow)
        .select("id")
        .single();

      if (insertError) {
        setStatusMessage(insertError.message);
        setLoading(false);
        return;
      }

      if (insertedBooking?.id) {
        const chargeRows = buildInitialBookingCharges({
          bookingId: insertedBooking.id,
          bookingUnit: bookingUnit || "day",
          totalPrice,
          monthlyRent: bookingUnit === "month" ? monthlyRent : undefined,
          depositAmount: bookingUnit === "month" ? depositAmount : undefined,
          startAt,
          endAt,
        });

        if (chargeRows.length > 0) {
          const { error: chargesError } = await (supabase
            .from("booking_charges") as any)
            .insert(chargeRows);

          if (chargesError) {
            console.error("booking_charges insert failed:", chargesError);
            const { error: deleteError } = await supabase
              .from("bookings")
              .delete()
              .eq("id", insertedBooking.id);

            if (deleteError) {
              console.error(
                "Could not roll back booking after charge insert failure:",
                deleteError
              );
              setStatusMessage(
                `Payment lines could not be created (${chargesError.message}). Your booking may need to be cancelled by support — reference: ${insertedBooking.id}.`
              );
            } else {
              setStatusMessage(
                `Your booking could not be completed: ${chargesError.message}. Please try again.`
              );
            }
            setLoading(false);
            return;
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
    router.push("/dashboard/my-bookings");
  }

  return (
    <>
      <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-semibold text-[#192a3a]">
          Book this space
        </h2>

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
                  Terms & Conditions
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
              Boolean(liveConflictMessage) ||
              Boolean(liveMinimumMessage) ||
              !acceptedTerms ||
              !bookingSelectionComplete
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#192a3a] px-4 py-3 text-sm font-medium text-white transition hover:opacity-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
        </form>
      </div>

      {requestSentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-request-sent-title"
          >
            <h3
              id="booking-request-sent-title"
              className="text-2xl font-semibold text-[#192a3a]"
            >
              Booking request sent
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Your request has been sent to the host. They will review it and either
              confirm or decline. No payment will be charged until they approve your
              request.
            </p>
            <button
              type="button"
              onClick={handleCloseRequestSentModal}
              className="mt-6 w-full rounded-md bg-[#192a3a] px-4 py-3 text-white"
            >
              Close
            </button>
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