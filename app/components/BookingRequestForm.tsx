"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buildInitialBookingCharges } from "@/lib/invoice";
import DayAvailabilityCalendar from "@/app/components/DayAvailabilityCalendar";
import AuthModal from "@/app/components/AuthModal";
import MonthAvailabilityCalendar from "@/app/components/MonthAvailabilityCalendar";
import HourAvailabilitySelector from "@/app/components/HourAvailabilitySelector";
import { useRouter } from "next/navigation";

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
  const [message, setMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    loadAvailabilityData();
    loadSpacePaymentSettings();
  }, [spaceId]);

  useEffect(() => {
    if (bookingUnit === "hour") {
      setHourStart("");
      setHourEnd("");
    }
  }, [hourDate, bookingUnit]);

  async function loadAvailabilityData() {
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

        notes: message || null,

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
      setMessage("");
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {bookingUnit === "hour" && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium">Select day</label>
                <input
                  type="date"
                  value={hourDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setHourDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-4 py-3"
                />
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
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {liveConflictMessage}
            </div>
          )}
          {liveMinimumMessage && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {liveMinimumMessage}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Message to owner
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi, I would like to book this space..."
              rows={4}
              className="w-full rounded-md border border-gray-300 px-4 py-3 outline-none focus:border-[#192a3a]"
            />
          </div>

          <div className="rounded-md border border-gray-200 bg-[#f8fafb] p-3 text-xs text-gray-600">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
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

          <button
            type="submit"
            disabled={loading || Boolean(liveConflictMessage) || Boolean(liveMinimumMessage) || !acceptedTerms}
            className="w-full rounded-md bg-[#192a3a] px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending..." : "Request booking"}
          </button>
        </form>

        {statusMessage && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {statusMessage}
          </div>
        )}
      </div>

      {requestSentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-2xl font-semibold text-[#192a3a]">
              Booking request sent
            </h3>
            <p className="mt-3 text-sm text-gray-600">
              Your request has been sent to the owner and is waiting for approval.
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
        nextPath={`/spaces/${spaceId}`}
        onClose={() => setAuthModalOpen(false)}
        onSwitchMode={(nextMode: "login" | "signup") =>
          setAuthMode(nextMode)
        }
      />
    </>
  );
}