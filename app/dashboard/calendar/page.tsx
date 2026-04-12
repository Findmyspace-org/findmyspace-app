

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Clock3,
    Eye,
    Home,
    LayoutDashboard,
    Landmark,
    Pencil,
    Receipt,
    Search,
    Wallet,
    X,
} from "lucide-react";
import RequireAuth from "@/app/components/RequireAuth";
import OwnerCalendarLegend from "@/app/dashboard/_components/calendar/OwnerCalendarLegend";
import OwnerTopNav from "@/app/dashboard/_components/calendar/OwnerTopNav";
import { supabase } from "@/lib/supabase";

type CalendarBookingType = "hour" | "day" | "month";

type CalendarSpace = {
    id: string;
    title: string | null;
    city: string | null;
    suburb: string | null;
    status: string | null;
    booking_unit: string | null;
};

type CalendarBooking = {
    id: string;
    space_id: string;
    renter_id: string | null;
    booking_unit: string | null;
    start_at: string;
    end_at: string;
    status: string | null;
    payment_status: string | null;
    total_price: number | null;
    renter?: {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
    } | null;
};

function bookingBlocksCalendarSlot(booking: CalendarBooking) {
    const status = booking.status || "";
    if (status === "expired" || status === "declined") return false;
    return (
        [
            "pending",
            "pending_owner",
            "approved",
            "accepted_awaiting_payment",
            "awaiting_payment",
            "paid_confirmed",
            "confirmed",
            "completed",
        ].includes(status) || booking.payment_status === "awaiting_payment"
    );
}

type CalendarBlockedDate = {
    id: string;
    space_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
};

type TimelineSegment = {
    id: string;
    kind: "booking" | "blocked";
    startIndex: number;
    endIndex: number;
    colorClass: string;
    label: string;
    hasConflict: boolean;
    isTruncatedStart: boolean;
    isTruncatedEnd: boolean;
};

function getListingStatusDotClass(status?: string | null) {
    if (status === "active") return "bg-emerald-500";
    if (status === "paused") return "bg-amber-500";
    if (status === "pending" || status === "pending_verification") {
        return "bg-blue-500";
    }
    if (status === "rejected") return "bg-red-500";
    return "bg-gray-400";
}

function getCellWidth(bookingType: CalendarBookingType) {
    return bookingType === "month" ? 84 : 72;
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function addMonths(date: Date, months: number) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
}

function getVisibleRange(currentDate: Date, bookingType: CalendarBookingType) {
    if (bookingType === "hour") {
        const start = startOfDay(currentDate);
        const end = addDays(start, 1);
        return { start, end };
    }

    if (bookingType === "day") {
        const start = startOfMonth(currentDate);
        const end = addMonths(start, 1);
        return { start, end };
    }

    const start = startOfMonth(currentDate);
    const end = addMonths(start, 12);
    return { start, end };
}

function getBookingColorClass(status?: string | null, paymentStatus?: string | null) {
    if (status === "pending" || status === "pending_owner") {
        return "bg-yellow-400 text-yellow-950";
    }

    if (status === "expired") {
        return "bg-amber-600 text-white";
    }

    if (
        status === "approved" ||
        status === "accepted_awaiting_payment" ||
        status === "awaiting_payment" ||
        paymentStatus === "awaiting_payment"
    ) {
        return "bg-blue-500 text-white";
    }

    if (
        status === "paid_confirmed" ||
        status === "confirmed" ||
        status === "completed" ||
        paymentStatus === "paid"
    ) {
        return "bg-emerald-500 text-white";
    }

    return "bg-gray-500 text-white";
}

function getColumnIndex(date: Date, rangeStart: Date, bookingType: CalendarBookingType) {
    if (bookingType === "hour") {
        return date.getHours();
    }

    if (bookingType === "day") {
        return Math.floor(
            (startOfDay(date).getTime() - startOfDay(rangeStart).getTime()) /
            (1000 * 60 * 60 * 24)
        );
    }

    return (
        (date.getFullYear() - rangeStart.getFullYear()) * 12 +
        (date.getMonth() - rangeStart.getMonth())
    );
}

function clampSegmentIndices(
    startAt: Date,
    endAt: Date,
    rangeStart: Date,
    rangeEnd: Date,
    bookingType: CalendarBookingType,
    columnCount: number
) {
    const visibleStart = new Date(Math.max(startAt.getTime(), rangeStart.getTime()));
    const visibleEnd = new Date(Math.min(endAt.getTime(), rangeEnd.getTime()));

    if (visibleEnd <= visibleStart) return null;

    const startIndex = Math.max(0, getColumnIndex(visibleStart, rangeStart, bookingType));

    const endReference = new Date(visibleEnd.getTime() - 1);
    let endIndex = getColumnIndex(endReference, rangeStart, bookingType);
    endIndex = Math.min(columnCount - 1, endIndex);

    if (endIndex < startIndex) return null;

    return {
        startIndex,
        endIndex,
    };
}

function buildBookingLabel(bookingType: CalendarBookingType, item: CalendarBooking | CalendarBlockedDate) {
    if ("renter_id" in item) {
        if (item.status === "expired") {
            return bookingType === "hour" ? "Expired booking" : "Expired";
        }

        if (bookingType === "hour") {
            return item.status === "pending" || item.status === "pending_owner"
                ? "Pending booking"
                : item.payment_status === "awaiting_payment" ||
                    item.status === "approved" ||
                    item.status === "accepted_awaiting_payment"
                    ? "Awaiting payment"
                    : "Confirmed booking";
        }

        return item.status === "pending" || item.status === "pending_owner"
            ? "Pending"
            : item.payment_status === "awaiting_payment" ||
                item.status === "approved" ||
                item.status === "accepted_awaiting_payment"
                ? "Awaiting payment"
                : "Confirmed";
    }

    return item.reason?.trim() || "Blocked";
}

function getSegmentShapeClass(segment: TimelineSegment) {
    const leftClass = segment.isTruncatedStart ? "rounded-l-md" : "rounded-l-full";
    const rightClass = segment.isTruncatedEnd ? "rounded-r-md" : "rounded-r-full";
    return `${leftClass} ${rightClass}`;
}

function formatBookingStatus(status?: string | null) {
    return (status || "unknown").replace(/_/g, " ");
}


function formatMoney(amount?: number | null) {
    return `R${Number(amount || 0).toFixed(2)}`;
}

// --- Calendar month booking helpers ---
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
        hour: get("hour", "0"),
        minute: get("minute", "0"),
        second: get("second", "0"),
    };
}

function toBusinessLocalDate(value: string) {
    const parts = getBusinessDateParts(value);
    return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

function getTimelineRange(item: CalendarBooking | CalendarBlockedDate, bookingType: CalendarBookingType) {
    const start = new Date(item.start_at);
    const end = new Date(item.end_at);

    if (bookingType !== "month") {
        return { start, end };
    }

    const normalizedStart = startOfMonth(toBusinessLocalDate(item.start_at));
    const normalizedEnd = startOfMonth(toBusinessLocalDate(item.end_at));

    return {
        start: normalizedStart,
        end: normalizedEnd,
    };
}

function formatMonthBookingRange(booking: CalendarBooking) {
    const start = startOfMonth(toBusinessLocalDate(booking.start_at));
    const exclusiveEnd = startOfMonth(toBusinessLocalDate(booking.end_at));
    const inclusiveEnd = addMonths(exclusiveEnd, -1);

    return `${start.toLocaleDateString("en-ZA", {
        month: "long",
        year: "numeric",
    })} - ${inclusiveEnd.toLocaleDateString("en-ZA", {
        month: "long",
        year: "numeric",
    })}`;
}


function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
    return startA < endB && endA > startB;
}

function normalizeSelectedRangeForBookingType(
    bookingType: CalendarBookingType,
    startIso: string,
    endIso: string
) {
    if (bookingType !== "month") {
        return {
            start: new Date(startIso),
            end: new Date(endIso),
        };
    }

    return {
        start: startOfMonth(toBusinessLocalDate(startIso)),
        end: startOfMonth(toBusinessLocalDate(endIso)),
    };
}

function toDateTimeLocalValue(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toDateOnlyValue(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function toMonthValue(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

function buildSegmentsForSpace(
    bookingType: CalendarBookingType,
    currentDate: Date,
    bookings: CalendarBooking[],
    blockedDates: CalendarBlockedDate[]
) {
    const { start: rangeStart, end: rangeEnd } = getVisibleRange(currentDate, bookingType);
    const columnCount =
        bookingType === "hour"
            ? 24
            : bookingType === "day"
            ? buildDailyColumns(currentDate).length
            : 12;

    const rawSegments: TimelineSegment[] = [];

    bookings.forEach((booking) => {
        const bookingRange = getTimelineRange(booking, bookingType);
        const segment = clampSegmentIndices(
            bookingRange.start,
            bookingRange.end,
            rangeStart,
            rangeEnd,
            bookingType,
            columnCount
        );

        if (!segment) return;

        rawSegments.push({
            id: booking.id,
            kind: "booking",
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
            colorClass: getBookingColorClass(booking.status, booking.payment_status),
            label: buildBookingLabel(bookingType, booking),
            hasConflict: false,
            isTruncatedStart: bookingRange.start < rangeStart,
            isTruncatedEnd: bookingRange.end > rangeEnd,
        });
    });

    blockedDates.forEach((blocked) => {
        const blockedRange = getTimelineRange(blocked, bookingType);
        const segment = clampSegmentIndices(
            blockedRange.start,
            blockedRange.end,
            rangeStart,
            rangeEnd,
            bookingType,
            columnCount
        );

        if (!segment) return;

        rawSegments.push({
            id: blocked.id,
            kind: "blocked",
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
            colorClass: "bg-gray-400 text-white",
            label: buildBookingLabel(bookingType, blocked),
            hasConflict: false,
            isTruncatedStart: blockedRange.start < rangeStart,
            isTruncatedEnd: blockedRange.end > rangeEnd,
        });
    });

    return rawSegments.map((segment, index) => {
        const hasConflict = rawSegments.some((other, otherIndex) => {
            if (index === otherIndex) return false;
            return segment.startIndex <= other.endIndex && segment.endIndex >= other.startIndex;
        });

        return {
            ...segment,
            hasConflict,
            colorClass: hasConflict ? "bg-red-500 text-white" : segment.colorClass,
        };
    });
}

function formatRangeLabel(currentDate: Date, bookingType: CalendarBookingType) {
    if (bookingType === "hour") {
        return currentDate.toLocaleDateString("en-ZA", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    }

    if (bookingType === "day") {
        return currentDate.toLocaleDateString("en-ZA", {
            month: "long",
            year: "numeric",
        });
    }

    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 11, 1);

    return `${start.toLocaleDateString("en-ZA", {
        month: "short",
        year: "numeric",
    })} - ${end.toLocaleDateString("en-ZA", {
        month: "short",
        year: "numeric",
    })}`;
}

function buildHourlyColumns(currentDate: Date) {
    return Array.from({ length: 24 }, (_, hour) => {
        const label = `${String(hour).padStart(2, "0")}:00`;
        return {
            key: label,
            label,
        };
    });
}

function buildDailyColumns(currentDate: Date) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(year, month, index + 1);
        return {
            key: date.toISOString(),
            labelTop: date.toLocaleDateString("en-ZA", { weekday: "short" }),
            labelBottom: String(index + 1),
        };
    });
}

function buildMonthlyColumns(currentDate: Date) {
    return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + index, 1);
        return {
            key: date.toISOString(),
            labelTop: date.toLocaleDateString("en-ZA", { month: "short" }),
            labelBottom: String(date.getFullYear()),
        };
    });
}


type EmptyTimelineCellProps = {
    bookingType: CalendarBookingType;
};

function EmptyTimelineCell({ bookingType }: EmptyTimelineCellProps) {
    const widthClass =
        bookingType === "month" ? "min-w-[84px]" : "min-w-[72px]";

    return (
        <div
            className={`h-12 ${widthClass} border-b border-r border-gray-200 bg-[#fcfcfd]`}
        />
    );
}


type BookingTypeTabsProps = {
    bookingType: CalendarBookingType;
    onChange: (value: CalendarBookingType) => void;
};

function BookingTypeTabs({ bookingType, onChange }: BookingTypeTabsProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {([
                { key: "hour", label: "Hourly" },
                { key: "day", label: "Daily" },
                { key: "month", label: "Monthly" },
            ] as { key: CalendarBookingType; label: string }[]).map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    onClick={() => onChange(tab.key)}
                    className={`rounded-md px-4 py-2 text-sm font-medium ${bookingType === tab.key
                        ? "bg-[#192a3a] text-white"
                        : "border border-gray-300 bg-white text-[#192a3a] hover:bg-gray-50"
                        }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

type CalendarRangeControlsProps = {
    bookingType: CalendarBookingType;
    currentDate: Date;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
};

function CalendarRangeControls({ bookingType, currentDate, onPrevious, onNext, onToday }: CalendarRangeControlsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={onPrevious}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] hover:bg-gray-50"
                aria-label="Previous"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[170px] text-center text-sm font-medium text-[#192a3a]">
                {formatRangeLabel(currentDate, bookingType)}
            </div>
            <button
                type="button"
                onClick={onNext}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] hover:bg-gray-50"
                aria-label="Next"
            >
                <ChevronRight className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={onToday}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a] hover:bg-gray-50"
            >
                Today
            </button>
        </div>
    );
}

type CalendarToolbarProps = {
    bookingType: CalendarBookingType;
    onBookingTypeChange: (value: CalendarBookingType) => void;
    currentDate: Date;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
    searchText: string;
    onSearchTextChange: (value: string) => void;
    areaFilter: string;
    onAreaFilterChange: (value: string) => void;
    areaOptions: string[];
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    dateRangeFilter: string;
    onDateRangeFilterChange: (value: string) => void;
};

function CalendarToolbar({
    bookingType,
    onBookingTypeChange,
    currentDate,
    onPrevious,
    onNext,
    onToday,
    searchText,
    onSearchTextChange,
    areaFilter,
    onAreaFilterChange,
    areaOptions,
    statusFilter,
    onStatusFilterChange,
    dateRangeFilter,
    onDateRangeFilterChange,
}: CalendarToolbarProps) {
    return (
        <div className="mb-4 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <BookingTypeTabs bookingType={bookingType} onChange={onBookingTypeChange} />
                <CalendarRangeControls
                    bookingType={bookingType}
                    currentDate={currentDate}
                    onPrevious={onPrevious}
                    onNext={onNext}
                    onToday={onToday}
                />
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="relative min-w-[220px] flex-1 xl:max-w-[280px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        value={searchText}
                        onChange={(e) => onSearchTextChange(e.target.value)}
                        placeholder="Search by property name"
                        className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-[#192a3a]"
                    />
                </div>

                <select
                    value={areaFilter}
                    onChange={(e) => onAreaFilterChange(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
                >
                    <option value="all">All areas</option>
                    {areaOptions.map((area) => (
                        <option key={area} value={area}>
                            {area}
                        </option>
                    ))}
                </select>

                <select
                    value={statusFilter}
                    onChange={(e) => onStatusFilterChange(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
                >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="pending">Pending</option>
                    <option value="pending_verification">Pending verification</option>
                </select>

                <select
                    value={dateRangeFilter}
                    onChange={(e) => onDateRangeFilterChange(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-[#192a3a] outline-none focus:border-[#192a3a]"
                >
                    <option value="current">Current range</option>
                    <option value="next">Next range</option>
                    <option value="custom">Custom range</option>
                </select>
            </div>
        </div>
    );
}

function ListingStatusLegend() {
    return (
        <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Listing status
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    Active
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-blue-500" />
                    Pending
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    Paused
                </div>
            </div>
        </div>
    );
}


function CalendarLegendPanel() {
    return (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-start lg:justify-between">
            <ListingStatusLegend />

            <div className="flex flex-col gap-2 lg:items-end">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Calendar
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 lg:justify-end">
                    <OwnerCalendarLegend />
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-red-500" />
                        Conflict
                    </div>
                </div>
            </div>
        </div>
    );
}


type CalendarColumnHeaderProps = {
    bookingType: CalendarBookingType;
    columns: any[];
};

function CalendarColumnHeader({ bookingType, columns }: CalendarColumnHeaderProps) {
    return (
        <div className="flex h-14 border-b border-gray-200 bg-[#fbfcfd]">
            {bookingType === "hour" &&
                (columns as { key: string; label: string }[]).map((column) => (
                    <div
                        key={column.key}
                        className="flex min-w-[72px] items-center justify-center border-r border-gray-200 px-2 text-xs font-medium text-gray-600"
                    >
                        <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            <span>{column.label}</span>
                        </span>
                    </div>
                ))}

            {bookingType === "day" &&
                (columns as { key: string; labelTop: string; labelBottom: string }[]).map((column) => (
                    <div
                        key={column.key}
                        className="flex min-w-[72px] flex-col items-center justify-center border-r border-gray-200 px-2 text-xs text-gray-600"
                    >
                        <span>{column.labelTop}</span>
                        <span className="mt-1 font-medium text-[#192a3a]">
                            {column.labelBottom}
                        </span>
                    </div>
                ))}

            {bookingType === "month" &&
                (columns as { key: string; labelTop: string; labelBottom: string }[]).map((column) => (
                    <div
                        key={column.key}
                        className="flex min-w-[84px] flex-col items-center justify-center border-r border-gray-200 px-2 text-xs text-gray-600"
                    >
                        <span>{column.labelTop}</span>
                        <span className="mt-1 font-medium text-[#192a3a]">
                            {column.labelBottom}
                        </span>
                    </div>
                ))}
        </div>
    );
}

// ---- Extracted local reusable calendar components ----

type CalendarSidebarProps = {
    bookingType: CalendarBookingType;
    loading: boolean;
    spaces: CalendarSpace[];
};

function CalendarSidebar({ bookingType, loading, spaces }: CalendarSidebarProps) {
    return (
        <div className="border-r border-gray-200 bg-[#fbfcfd]">
            <div className="flex h-14 flex-col justify-center border-b border-gray-200 px-4">
                <span className="text-sm font-semibold text-[#192a3a]">Properties</span>
                <span className="text-[11px] text-gray-500 capitalize">{bookingType} View</span>
            </div>

            {loading ? (
                <div className="px-4 py-6 text-sm text-gray-500">Loading properties...</div>
            ) : spaces.length === 0 ? (
                <div className="px-4 py-6 text-sm text-gray-500">No properties match these filters.</div>
            ) : (
                spaces.map((space) => (
                    <div
                        key={space.id}
                        className="flex h-12 items-center gap-3 border-b border-gray-200 px-4"
                    >
                        <span
                            className={`h-2.5 w-2.5 rounded-full ${getListingStatusDotClass(
                                space.status
                            )}`}
                        />
                        <span className="truncate text-sm text-[#192a3a]">
                            {space.title || "Untitled space"}
                        </span>
                    </div>
                ))
            )}
        </div>
    );
}

type CalendarSegmentButtonProps = {
    segment: TimelineSegment;
    left: number;
    width: number;
    booking: CalendarBooking | null;
    blockedDate: CalendarBlockedDate | null;
    onBookingClick: (booking: CalendarBooking) => void;
    onBlockedDateClick: (blockedDate: CalendarBlockedDate) => void;
};

function CalendarSegmentButton({
    segment,
    left,
    width,
    booking,
    blockedDate,
    onBookingClick,
    onBlockedDateClick,
}: CalendarSegmentButtonProps) {
    return (
        <button
            type="button"
            onClick={() => {
                if (booking) {
                    onBookingClick(booking);
                    return;
                }

                if (blockedDate) {
                    onBlockedDateClick(blockedDate);
                }
            }}
            className={`pointer-events-auto absolute top-1/2 flex h-6 -translate-y-1/2 items-center px-2 text-[11px] font-medium shadow-sm ${segment.colorClass} ${getSegmentShapeClass(segment)} ${segment.hasConflict ? "ring-2 ring-red-300" : ""} ${segment.kind === "blocked" ? "bg-[repeating-linear-gradient(135deg,rgba(156,163,175,1)_0px,rgba(156,163,175,1)_10px,rgba(107,114,128,1)_10px,rgba(107,114,128,1)_20px)]" : ""}`}
            style={{
                left,
                width,
            }}
            title={segment.label}
        >
            {!segment.isTruncatedStart && segment.kind === "booking" && (
                <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-white/80" />
            )}

            <span className="truncate">{segment.label}</span>

            {!segment.isTruncatedEnd && segment.kind === "booking" && (
                <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-white/80" />
            )}
        </button>
    );
}

type CalendarSpaceRowProps = {
    space: CalendarSpace;
    columns: any[];
    bookingType: CalendarBookingType;
    currentDate: Date;
    bookings: CalendarBooking[];
    blockedDates: CalendarBlockedDate[];
    cellWidth: number;
    onEmptySlotClick: (space: CalendarSpace, columnIndex: number) => void;
    onBookingClick: (booking: CalendarBooking, space: CalendarSpace) => void;
    onBlockedDateClick: (blockedDate: CalendarBlockedDate, space: CalendarSpace) => void;
};

function CalendarSpaceRow({
    space,
    columns,
    bookingType,
    currentDate,
    bookings,
    blockedDates,
    cellWidth,
    onEmptySlotClick,
    onBookingClick,
    onBlockedDateClick,
}: CalendarSpaceRowProps) {
    const segments = buildSegmentsForSpace(
        bookingType,
        currentDate,
        bookings,
        blockedDates
    );

    return (
        <div className="relative flex h-12">
            {columns.map((column: any, columnIndex: number) => (
                <button
                    key={`${space.id}-${column.key}`}
                    type="button"
                    onClick={() => onEmptySlotClick(space, columnIndex)}
                    className="relative block"
                >
                    <EmptyTimelineCell bookingType={bookingType} />
                </button>
            ))}

            <div className="pointer-events-none absolute inset-0">
                {segments.map((segment) => {
                    const left = segment.startIndex * cellWidth + 4;
                    const width =
                        (segment.endIndex - segment.startIndex + 1) * cellWidth - 8;

                    const booking =
                        segment.kind === "booking"
                            ? bookings.find((item) => item.id === segment.id) || null
                            : null;
                    const blockedDate =
                        segment.kind === "blocked"
                            ? blockedDates.find((item) => item.id === segment.id) || null
                            : null;

                    return (
                        <CalendarSegmentButton
                            key={segment.id}
                            segment={segment}
                            left={left}
                            width={width}
                            booking={booking}
                            blockedDate={blockedDate}
                            onBookingClick={(item) => onBookingClick(item, space)}
                            onBlockedDateClick={(item) => onBlockedDateClick(item, space)}
                        />
                    );
                })}
            </div>
        </div>
    );
}

type CalendarGridProps = {
    bookingType: CalendarBookingType;
    columns: any[];
    loading: boolean;
    spaces: CalendarSpace[];
    bookingsBySpace: Record<string, CalendarBooking[]>;
    blockedDatesBySpace: Record<string, CalendarBlockedDate[]>;
    currentDate: Date;
    cellWidth: number;
    onEmptySlotClick: (space: CalendarSpace, columnIndex: number) => void;
    onBookingClick: (booking: CalendarBooking, space: CalendarSpace) => void;
    onBlockedDateClick: (blockedDate: CalendarBlockedDate, space: CalendarSpace) => void;
};

function CalendarGrid({
    bookingType,
    columns,
    loading,
    spaces,
    bookingsBySpace,
    blockedDatesBySpace,
    currentDate,
    cellWidth,
    onEmptySlotClick,
    onBookingClick,
    onBlockedDateClick,
}: CalendarGridProps) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="grid min-h-[560px] grid-cols-[220px_1fr]">
                <CalendarSidebar bookingType={bookingType} loading={loading} spaces={spaces} />

                <div className="overflow-x-auto">
                    <div className="min-w-max">
                        <CalendarColumnHeader bookingType={bookingType} columns={columns} />

                        {loading ? (
                            <div className="p-6 text-sm text-gray-500">Loading calendar...</div>
                        ) : spaces.length === 0 ? (
                            <div className="p-6 text-sm text-gray-500">Nothing to show for this view.</div>
                        ) : (
                            spaces.map((space) => {
                                const spaceBookings = bookingsBySpace[space.id] || [];
                                const spaceBlockedDates = blockedDatesBySpace[space.id] || [];

                                return (
                                    <CalendarSpaceRow
                                        key={space.id}
                                        space={space}
                                        columns={columns}
                                        bookingType={bookingType}
                                        currentDate={currentDate}
                                        bookings={spaceBookings}
                                        blockedDates={spaceBlockedDates}
                                        cellWidth={cellWidth}
                                        onEmptySlotClick={onEmptySlotClick}
                                        onBookingClick={onBookingClick}
                                        onBlockedDateClick={onBlockedDateClick}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- Drawer and Modal Components ----

type BookingModalProps = {
    open: boolean;
    booking: CalendarBooking | null;
    space: CalendarSpace | null;
    onClose: () => void;
};

function BookingModal({ open, booking, space, onClose }: BookingModalProps) {
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [invoiceHtml, setInvoiceHtml] = useState<string | null>(null);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [invoiceError, setInvoiceError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setInvoiceModalOpen(false);
            setInvoiceHtml(null);
            setInvoiceError(null);
            setInvoiceLoading(false);
        }
    }, [open]);

    const openInvoice = useCallback(async () => {
        if (!booking) return;
        setInvoiceError(null);
        setInvoiceHtml(null);
        setInvoiceModalOpen(true);
        setInvoiceLoading(true);

        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!session?.access_token) {
                setInvoiceError("Please log in to view the invoice.");
                setInvoiceLoading(false);
                return;
            }

            const res = await fetch(`/api/invoice/${booking.id}`, {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });

            const text = await res.text();

            if (!res.ok) {
                setInvoiceError(
                    res.status === 403
                        ? "Invoice is only available after payment is confirmed."
                        : text || "Could not load invoice."
                );
                setInvoiceLoading(false);
                return;
            }

            setInvoiceHtml(text);
        } catch {
            setInvoiceError("Could not load invoice.");
        } finally {
            setInvoiceLoading(false);
        }
    }, [booking]);

    if (!open || !booking || !space) return null;

    const firstName = booking.renter?.first_name?.trim() || "";
    const lastName = booking.renter?.last_name?.trim() || "";

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-modal-title"
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,880px)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-gray-200 bg-white shadow-2xl"
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Booking</p>
                        <h2 id="booking-modal-title" className="mt-1 truncate text-lg font-semibold text-[#192a3a]">
                            {space.title || "Untitled space"}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                    <section className="space-y-3 rounded-xl border border-gray-200 bg-[#fbfcfd] p-4">
                        <h3 className="text-sm font-semibold text-[#192a3a]">Renter</h3>
                        <div className="space-y-2 text-sm text-gray-700">
                            <p>
                                <span className="font-medium text-[#192a3a]">First name:</span>{" "}
                                {firstName || "—"}
                            </p>
                            <p>
                                <span className="font-medium text-[#192a3a]">Last name:</span>{" "}
                                {lastName || "—"}
                            </p>
                            <p>
                                <span className="font-medium text-[#192a3a]">Email:</span>{" "}
                                {booking.renter?.email || "—"}
                            </p>
                            <p>
                                <span className="font-medium text-[#192a3a]">Phone:</span>{" "}
                                {booking.renter?.phone || "—"}
                            </p>
                        </div>
                    </section>

                    <section className="space-y-3 rounded-xl border border-gray-200 bg-[#fbfcfd] p-4">
                        <h3 className="text-sm font-semibold text-[#192a3a]">Booking details</h3>
                        <div className="space-y-2 text-sm text-gray-700">
                            {booking.booking_unit === "month" ? (
                                <p>
                                    <span className="font-medium text-[#192a3a]">Booking period:</span>{" "}
                                    {formatMonthBookingRange(booking)}
                                </p>
                            ) : (
                                <>
                                    <p>
                                        <span className="font-medium text-[#192a3a]">Start:</span>{" "}
                                        {new Date(booking.start_at).toLocaleString()}
                                    </p>
                                    <p>
                                        <span className="font-medium text-[#192a3a]">End:</span>{" "}
                                        {new Date(booking.end_at).toLocaleString()}
                                    </p>
                                </>
                            )}
                            <p>
                                <span className="font-medium text-[#192a3a]">Booking status:</span>{" "}
                                {formatBookingStatus(booking.status)}
                            </p>
                            <p>
                                <span className="font-medium text-[#192a3a]">Payment status:</span>{" "}
                                {formatBookingStatus(booking.payment_status)}
                            </p>
                        </div>
                    </section>

                    <section className="space-y-3 rounded-xl border border-gray-200 bg-[#fbfcfd] p-4">
                        <h3 className="text-sm font-semibold text-[#192a3a]">Listing</h3>
                        <div className="space-y-3">
                            <Link
                                href={`/spaces/${space.id}`}
                                className="inline-flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-white"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    View listing
                                </span>
                                <span>›</span>
                            </Link>

                            <Link
                                href={`/spaces/${space.id}/edit`}
                                className="inline-flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-white"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Pencil className="h-4 w-4" />
                                    Edit listing
                                </span>
                                <span>›</span>
                            </Link>
                        </div>
                    </section>

                    <section className="space-y-3 rounded-xl border border-gray-200 bg-[#fbfcfd] p-4">
                        <h3 className="text-sm font-semibold text-[#192a3a]">Finance</h3>
                        <div className="space-y-2 text-sm text-gray-700">
                            <p>
                                <span className="font-medium text-[#192a3a]">Amount:</span> {formatMoney(booking.total_price)}
                            </p>
                            <p>
                                <span className="font-medium text-[#192a3a]">Payout status:</span> Coming soon
                            </p>
                        </div>

                        <div className="space-y-3 pt-1">
                            <button
                                type="button"
                                onClick={() => void openInvoice()}
                                className="inline-flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-white"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Receipt className="h-4 w-4" />
                                    View invoice
                                </span>
                                <span>›</span>
                            </button>

                            <Link
                                href="/dashboard/finance"
                                className="inline-flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-white"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Wallet className="h-4 w-4" />
                                    Open finance page
                                </span>
                                <span>›</span>
                            </Link>
                        </div>
                    </section>
                </div>
            </div>

            {invoiceModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-6">
                    <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                            <h2 className="text-lg font-semibold text-[#192a3a]">Invoice</h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setInvoiceModalOpen(false);
                                    setInvoiceHtml(null);
                                    setInvoiceError(null);
                                }}
                                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-[#192a3a]"
                                aria-label="Close invoice"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto p-4">
                            {invoiceLoading && <p className="text-sm text-gray-600">Loading invoice…</p>}
                            {invoiceError && <p className="text-sm text-red-700">{invoiceError}</p>}
                            {!invoiceLoading && !invoiceError && invoiceHtml && (
                                <iframe
                                    title="Invoice"
                                    className="h-[min(70vh,720px)] w-full rounded-md border border-gray-200 bg-white"
                                    srcDoc={invoiceHtml}
                                    sandbox="allow-same-origin"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

type BlockedDateDrawerProps = {
    blockedDate: CalendarBlockedDate;
    space: CalendarSpace;
    onRemove: () => void;
};

function BlockedDateDrawer({ blockedDate, space, onRemove }: BlockedDateDrawerProps) {
    return (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-[#fbfcfd] p-4">
            <h3 className="text-sm font-semibold text-[#192a3a]">Blocked availability</h3>
            <div className="space-y-2 text-sm text-gray-700">
                <p><span className="font-medium text-[#192a3a]">Start:</span> {new Date(blockedDate.start_at).toLocaleString()}</p>
                <p><span className="font-medium text-[#192a3a]">End:</span> {new Date(blockedDate.end_at).toLocaleString()}</p>
                <p><span className="font-medium text-[#192a3a]">Reason:</span> {blockedDate.reason || "No reason added"}</p>
            </div>

            <div className="space-y-3 pt-1">
                <button
                    type="button"
                    onClick={onRemove}
                    className="inline-flex w-full items-center justify-between rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                    <span>Remove blocked section</span>
                    <span>›</span>
                </button>

                <Link
                    href={`/spaces/${space.id}`}
                    className="inline-flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-white"
                >
                    <span className="inline-flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        View listing
                    </span>
                    <span>›</span>
                </Link>

                <Link
                    href={`/spaces/${space.id}/edit`}
                    className="inline-flex w-full items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm text-[#192a3a] hover:bg-white"
                >
                    <span className="inline-flex items-center gap-2">
                        <Pencil className="h-4 w-4" />
                        Edit listing
                    </span>
                    <span>›</span>
                </Link>
            </div>
        </section>
    );
}

type SlotBlockModalProps = {
    open: boolean;
    space: CalendarSpace | null;
    bookingType: CalendarBookingType;
    slotSaving: boolean;
    slotError: string;
    selectedSlotBlockedDate: CalendarBlockedDate | null;
    slotStartInput: string;
    setSlotStartInput: React.Dispatch<React.SetStateAction<string>>;
    slotEndInput: string;
    setSlotEndInput: React.Dispatch<React.SetStateAction<string>>;
    blockReason: string;
    setBlockReason: React.Dispatch<React.SetStateAction<string>>;
    onClose: () => void;
    onSave: () => void;
};

function SlotBlockModal({
    open,
    space,
    bookingType,
    slotSaving,
    slotError,
    selectedSlotBlockedDate,
    slotStartInput,
    setSlotStartInput,
    slotEndInput,
    setSlotEndInput,
    blockReason,
    setBlockReason,
    onClose,
    onSave,
}: SlotBlockModalProps) {
    if (!open || !space) return null;

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { if (!slotSaving) onClose(); }} />

            <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {selectedSlotBlockedDate ? "Blocked range" : "Availability range"}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-[#192a3a]">
                            {space.title || "Untitled space"}
                        </h3>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {slotError && (
                    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {slotError}
                    </div>
                )}

                <div className="mt-4 grid gap-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#192a3a]">Start</label>
                        <input
                            type={bookingType === "hour" ? "datetime-local" : bookingType === "day" ? "date" : "month"}
                            value={slotStartInput}
                            onChange={(e) => setSlotStartInput(e.target.value)}
                            disabled={slotSaving}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a] disabled:bg-gray-100"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-[#192a3a]">End</label>
                        <input
                            type={bookingType === "hour" ? "datetime-local" : bookingType === "day" ? "date" : "month"}
                            value={slotEndInput}
                            onChange={(e) => setSlotEndInput(e.target.value)}
                            disabled={slotSaving}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a] disabled:bg-gray-100"
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium text-[#192a3a]">Block reason</label>
                    <textarea
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        rows={3}
                        disabled={slotSaving}
                        placeholder="Add a reason for blocking this range"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#192a3a] disabled:bg-gray-100"
                    />
                </div>

                <div className="mt-5 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm text-[#192a3a] hover:bg-gray-50"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onSave}
                        disabled={slotSaving}
                        className={`rounded-md px-4 py-2 text-sm text-white ${selectedSlotBlockedDate ? "bg-red-600 hover:bg-red-700" : "bg-[#192a3a] hover:opacity-90"} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        {slotSaving ? "Saving..." : selectedSlotBlockedDate ? "Unblock availability" : "Block availability"}
                    </button>
                </div>
            </div>
        </>
    );
}

type SideDrawerProps = {
    open: boolean;
    title: string;
    subtitle: string;
    onClose: () => void;
    children: React.ReactNode;
};

function SideDrawer({ open, title, subtitle, onClose, children }: SideDrawerProps) {
    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

            <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                            {subtitle}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-[#192a3a]">
                            {title}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                    {children}
                </div>
            </aside>
        </>
    );
}

export default function CalendarPage() {
    const [bookingType, setBookingType] = useState<CalendarBookingType>("day");
    const [searchText, setSearchText] = useState("");
    const [areaFilter, setAreaFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRangeFilter, setDateRangeFilter] = useState("current");
    const [currentDate, setCurrentDate] = useState(new Date());
    const [spaces, setSpaces] = useState<CalendarSpace[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    const [bookings, setBookings] = useState<CalendarBooking[]>([]);
    const [blockedDates, setBlockedDates] = useState<CalendarBlockedDate[]>([]);

    useEffect(() => {
        async function loadSpaces() {
            setLoading(true);
            setMessage("");

            const {
                data: { user },
                error: authError,
            } = await supabase.auth.getUser();

            if (authError || !user) {
                setMessage("Please log in to view your calendar.");
                setLoading(false);
                return;
            }

            const { data, error } = await (supabase.from("spaces") as any)
                .select("id, title, city, suburb, status, booking_unit")
                .eq("owner_id", user.id)
                .order("title", { ascending: true });

            if (error) {
                setMessage(error.message || "Could not load spaces.");
                setLoading(false);
                return;
            }

            const nextSpaces = (data || []) as CalendarSpace[];
            setSpaces(nextSpaces);

            const spaceIds = nextSpaces.map((space) => space.id);

            if (spaceIds.length > 0) {
                const { data: bookingData, error: bookingError } = await (supabase.from("bookings") as any)
                    .select(
                        `
                        id,
                        space_id,
                        renter_id,
                        booking_unit,
                        start_at,
                        end_at,
                        status,
                        payment_status,
                        total_price,
                        renter:profiles!bookings_renter_id_fkey (
                          first_name,
                          last_name,
                          email,
                          phone
                        )
                      `
                    )
                    .in("space_id", spaceIds)
                    // Exclude "expired": those dates are free again; showing them blocks the owner's view of availability.
                    .in("status", [
                        "pending",
                        "pending_owner",
                        "approved",
                        "accepted_awaiting_payment",
                        "awaiting_payment",
                        "paid_confirmed",
                        "confirmed",
                        "completed",
                    ]);

                const { data: blockedData } = await (supabase.from("blocked_dates") as any)
                    .select("id, space_id, start_at, end_at, reason")
                    .in("space_id", spaceIds);

                if (bookingError) {
                    setMessage(bookingError.message || "Could not load bookings.");
                    setBookings([]);
                } else {
                    const rows = (bookingData || []) as Array<
                        CalendarBooking & { renter?: CalendarBooking["renter"] }
                    >;
                    setBookings(
                        rows.map((row) => ({
                            ...row,
                            renter: row.renter ?? null,
                        }))
                    );
                }

                setBlockedDates((blockedData || []) as CalendarBlockedDate[]);
            } else {
                setBookings([]);
                setBlockedDates([]);
            }
            setLoading(false);
        }

        loadSpaces();
    }, []);

    const areaOptions = useMemo(() => {
        const values = Array.from(
            new Set(
                spaces
                    .map((space) => space.city || space.suburb || "")
                    .filter(Boolean)
            )
        );

        return values.sort((a, b) => a.localeCompare(b));
    }, [spaces]);

    const filteredSpaces = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();

        return spaces.filter((space) => {
            const unitMatches = (space.booking_unit || "day") === bookingType;
            if (!unitMatches) return false;

            if (areaFilter !== "all") {
                const area = space.city || space.suburb || "";
                if (area !== areaFilter) return false;
            }

            if (statusFilter !== "all" && (space.status || "") !== statusFilter) {
                return false;
            }

            if (!normalizedSearch) return true;

            const searchable = [space.title, space.city, space.suburb]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchable.includes(normalizedSearch);
        });
    }, [spaces, bookingType, areaFilter, statusFilter, searchText]);

    const columns = useMemo(() => {
        if (bookingType === "hour") return buildHourlyColumns(currentDate);
        if (bookingType === "month") return buildMonthlyColumns(currentDate);
        return buildDailyColumns(currentDate);
    }, [bookingType, currentDate]);

    const visibleRange = useMemo(() => {
        return getVisibleRange(currentDate, bookingType);
    }, [currentDate, bookingType]);

    const cellWidth = useMemo(() => getCellWidth(bookingType), [bookingType]);

    function goPrevious() {
        const next = new Date(currentDate);

        if (bookingType === "hour") {
            next.setDate(next.getDate() - 1);
        } else if (bookingType === "day") {
            next.setMonth(next.getMonth() - 1);
        } else {
            next.setFullYear(next.getFullYear() - 1);
        }

        setCurrentDate(next);
    }

    function goNext() {
        const next = new Date(currentDate);

        if (bookingType === "hour") {
            next.setDate(next.getDate() + 1);
        } else if (bookingType === "day") {
            next.setMonth(next.getMonth() + 1);
        } else {
            next.setFullYear(next.getFullYear() + 1);
        }

        setCurrentDate(next);
    }

    function goToday() {
        setCurrentDate(new Date());
    }

    const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null);
    const [selectedBlockedDate, setSelectedBlockedDate] = useState<CalendarBlockedDate | null>(null);
    const [selectedDrawerSpace, setSelectedDrawerSpace] = useState<CalendarSpace | null>(null);

    const [slotModalOpen, setSlotModalOpen] = useState(false);
    const [selectedSlotSpace, setSelectedSlotSpace] = useState<CalendarSpace | null>(null);
    const [selectedSlotLabel, setSelectedSlotLabel] = useState("");

    const [selectedSlotStart, setSelectedSlotStart] = useState("");
    const [selectedSlotEnd, setSelectedSlotEnd] = useState("");
    const [selectedSlotBlockedDate, setSelectedSlotBlockedDate] = useState<CalendarBlockedDate | null>(null);
    const [slotStartInput, setSlotStartInput] = useState("");
    const [slotEndInput, setSlotEndInput] = useState("");
    const [blockReason, setBlockReason] = useState("");
    const [slotSaving, setSlotSaving] = useState(false);
    const [slotError, setSlotError] = useState("");

    function handleBookingClick(booking: CalendarBooking, space: CalendarSpace) {
        setSelectedBlockedDate(null);
        setSelectedBooking(booking);
        setSelectedDrawerSpace(space);
    }

    function handleBlockedDateClick(blockedDate: CalendarBlockedDate, space: CalendarSpace) {
        setSelectedBooking(null);
        setSelectedBlockedDate(blockedDate);
        setSelectedDrawerSpace(space);
    }

    function handleTimelineBookingClick(booking: CalendarBooking, space: CalendarSpace) {
        handleBookingClick(booking, space);
    }

    function handleTimelineBlockedDateClick(blockedDate: CalendarBlockedDate, space: CalendarSpace) {
        handleBlockedDateClick(blockedDate, space);
    }

    function getSlotRangeFromColumnIndex(columnIndex: number) {
        if (bookingType === "hour") {
            const start = new Date(currentDate);
            start.setHours(columnIndex, 0, 0, 0);
            const end = new Date(start);
            end.setHours(end.getHours() + 1);
            return { start, end };
        }

        if (bookingType === "day") {
            const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), columnIndex + 1, 0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            return { start, end };
        }

        const start = new Date(currentDate.getFullYear(), currentDate.getMonth() + columnIndex, 1, 0, 0, 0, 0);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0);
        return { start, end };
    }

    function findBlockedDateForSlot(spaceId: string, slotStart: Date, slotEnd: Date) {
        return (
            blockedDates.find((blocked) => {
                if (blocked.space_id !== spaceId) return false;

                const blockedStart = new Date(blocked.start_at);
                const blockedEnd = new Date(blocked.end_at);

                return (
                    blockedStart.getTime() === slotStart.getTime() &&
                    blockedEnd.getTime() === slotEnd.getTime()
                );
            }) || null
        );
    }

    function syncSelectedSlotRangeFromInputs() {
        if (!slotStartInput || !slotEndInput) return null;

        let start: Date;
        let end: Date;

        if (bookingType === "hour") {
            start = new Date(slotStartInput);
            end = new Date(slotEndInput);
        } else if (bookingType === "day") {
            start = new Date(`${slotStartInput}T00:00:00`);
            end = new Date(`${slotEndInput}T00:00:00`);
            end.setDate(end.getDate() + 1);
        } else {
            const [startYear, startMonth] = slotStartInput.split("-").map(Number);
            const [endYear, endMonth] = slotEndInput.split("-").map(Number);
            start = new Date(startYear, startMonth - 1, 1, 0, 0, 0, 0);
            end = new Date(endYear, endMonth, 1, 0, 0, 0, 0);
        }

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            return null;
        }

        return {
            startIso: start.toISOString(),
            endIso: end.toISOString(),
        };
    }

    function rangeOverlapsExistingBooking(spaceId: string, startIso: string, endIso: string) {
        const selectedRange = normalizeSelectedRangeForBookingType(
            bookingType,
            startIso,
            endIso
        );

        return bookings.some((booking) => {
            if (booking.space_id !== spaceId) return false;
            if (!bookingBlocksCalendarSlot(booking)) return false;

            const bookingRange =
                bookingType === "month"
                    ? getTimelineRange(booking, "month")
                    : {
                          start: new Date(booking.start_at),
                          end: new Date(booking.end_at),
                      };

            return rangesOverlap(
                selectedRange.start,
                selectedRange.end,
                bookingRange.start,
                bookingRange.end
            );
        });
    }

    function getSlotLabel(columnIndex: number) {
        if (bookingType === "hour") {
            const slotDate = new Date(currentDate);
            slotDate.setHours(columnIndex, 0, 0, 0);
            const endDate = new Date(slotDate);
            endDate.setHours(endDate.getHours() + 1);
            return `${slotDate.toLocaleString()} - ${endDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            })}`;
        }

        if (bookingType === "day") {
            const slotDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), columnIndex + 1);
            return slotDate.toLocaleDateString("en-ZA", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
            });
        }

        const slotDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + columnIndex, 1);
        return slotDate.toLocaleDateString("en-ZA", {
            month: "long",
            year: "numeric",
        });
    }

    function handleEmptySlotClick(space: CalendarSpace, columnIndex: number) {
        setSelectedBooking(null);
        setSelectedBlockedDate(null);
        setSelectedDrawerSpace(null);

        const { start, end } = getSlotRangeFromColumnIndex(columnIndex);
        const nextStartIso = start.toISOString();
        const nextEndIso = end.toISOString();
        const existingBlockedDate = findBlockedDateForSlot(space.id, start, end);

        setSelectedSlotSpace(space);
        setSelectedSlotLabel(getSlotLabel(columnIndex));
        setSelectedSlotStart(nextStartIso);
        setSelectedSlotEnd(nextEndIso);
        setSelectedSlotBlockedDate(existingBlockedDate);
        setBlockReason(existingBlockedDate?.reason || "");

        if (bookingType === "hour") {
            setSlotStartInput(toDateTimeLocalValue(nextStartIso));
            setSlotEndInput(toDateTimeLocalValue(nextEndIso));
        } else if (bookingType === "day") {
            setSlotStartInput(toDateOnlyValue(nextStartIso));
            setSlotEndInput(toDateOnlyValue(nextStartIso));
        } else {
            setSlotStartInput(toMonthValue(nextStartIso));
            setSlotEndInput(toMonthValue(nextStartIso));
        }

        setSlotError("");
        setSlotModalOpen(true);
    }

    async function handleRemoveBlockedDate(blockedDate: CalendarBlockedDate) {
        const { error } = await (supabase.from("blocked_dates") as any)
            .delete()
            .eq("id", blockedDate.id);

        if (error) {
            setSlotError(error.message || "Could not remove blocked availability.");
            return;
        }

        setBlockedDates((current) => current.filter((item) => item.id !== blockedDate.id));
        setSelectedBlockedDate(null);
        setSelectedDrawerSpace(null);
    }

    async function handleSaveSlotBlock() {
        if (!selectedSlotSpace) return;

        const syncedRange = syncSelectedSlotRangeFromInputs();

        if (!syncedRange) {
            setSlotError("Please choose a valid start and end range.");
            return;
        }

        if (rangeOverlapsExistingBooking(selectedSlotSpace.id, syncedRange.startIso, syncedRange.endIso)) {
            setSlotError("You cannot block dates or times over an existing booking.");
            return;
        }

        const matchingBlockedDate = findBlockedDateForSlot(
            selectedSlotSpace.id,
            new Date(syncedRange.startIso),
            new Date(syncedRange.endIso)
        );

        setSelectedSlotStart(syncedRange.startIso);
        setSelectedSlotEnd(syncedRange.endIso);
        setSelectedSlotBlockedDate(matchingBlockedDate);

        setSlotSaving(true);
        setSlotError("");

        if (matchingBlockedDate) {
            const { error } = await (supabase.from("blocked_dates") as any)
                .delete()
                .eq("id", matchingBlockedDate.id);

            if (error) {
                setSlotError(error.message || "Could not unblock availability.");
                setSlotSaving(false);
                return;
            }

            setBlockedDates((current) =>
                current.filter((item) => item.id !== matchingBlockedDate.id)
            );
        } else {
            const { data, error } = await (supabase.from("blocked_dates") as any)
                .insert({
                    space_id: selectedSlotSpace.id,
                    start_at: syncedRange.startIso,
                    end_at: syncedRange.endIso,
                    reason: blockReason.trim() || null,
                })
                .select("id, space_id, start_at, end_at, reason")
                .single();

            if (error) {
                setSlotError(error.message || "Could not block availability.");
                setSlotSaving(false);
                return;
            }

            setBlockedDates((current) => [...current, data as CalendarBlockedDate]);
        }

        setSlotSaving(false);
        setSlotError("");
        setSlotModalOpen(false);
        setSelectedSlotSpace(null);
        setSelectedSlotLabel("");
        setSelectedSlotStart("");
        setSelectedSlotEnd("");
        setSelectedSlotBlockedDate(null);
        setBlockReason("");
        setSlotStartInput("");
        setSlotEndInput("");
    }

    const bookingsBySpace = useMemo(() => {
        const map: Record<string, CalendarBooking[]> = {};
        bookings.forEach((booking) => {
            if (!map[booking.space_id]) map[booking.space_id] = [];
            map[booking.space_id].push(booking);
        });
        return map;
    }, [bookings]);

    const blockedDatesBySpace = useMemo(() => {
        const map: Record<string, CalendarBlockedDate[]> = {};
        blockedDates.forEach((blockedDate) => {
            if (!map[blockedDate.space_id]) map[blockedDate.space_id] = [];
            map[blockedDate.space_id].push(blockedDate);
        });
        return map;
    }, [blockedDates]);

    function closeDrawer() {
        setSelectedBooking(null);
        setSelectedBlockedDate(null);
        setSelectedDrawerSpace(null);
    }

    function closeSlotModal() {
        if (slotSaving) return;
        setSlotError("");
        setSlotModalOpen(false);
        setSelectedSlotSpace(null);
        setSelectedSlotLabel("");
        setSelectedSlotStart("");
        setSelectedSlotEnd("");
        setSelectedSlotBlockedDate(null);
        setBlockReason("");
        setSlotStartInput("");
        setSlotEndInput("");
    }

    return (
        <RequireAuth>
            <main className="min-h-screen bg-[#f7f9fb] px-4 py-5 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <OwnerTopNav active="calendar" />

                    <CalendarToolbar
                        bookingType={bookingType}
                        onBookingTypeChange={setBookingType}
                        currentDate={currentDate}
                        onPrevious={goPrevious}
                        onNext={goNext}
                        onToday={goToday}
                        searchText={searchText}
                        onSearchTextChange={setSearchText}
                        areaFilter={areaFilter}
                        onAreaFilterChange={setAreaFilter}
                        areaOptions={areaOptions}
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        dateRangeFilter={dateRangeFilter}
                        onDateRangeFilterChange={setDateRangeFilter}
                    />

                    <CalendarLegendPanel />

                    {message && (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {message}
                        </div>
                    )}

                    <CalendarGrid
                        bookingType={bookingType}
                        columns={columns}
                        loading={loading}
                        spaces={filteredSpaces}
                        bookingsBySpace={bookingsBySpace}
                        blockedDatesBySpace={blockedDatesBySpace}
                        currentDate={currentDate}
                        cellWidth={cellWidth}
                        onEmptySlotClick={handleEmptySlotClick}
                        onBookingClick={handleTimelineBookingClick}
                        onBlockedDateClick={handleTimelineBlockedDateClick}
                    />
                </div>
                <BookingModal
                    open={Boolean(selectedBooking && selectedDrawerSpace)}
                    booking={selectedBooking}
                    space={selectedDrawerSpace}
                    onClose={closeDrawer}
                />

                <SideDrawer
                    open={Boolean(selectedBlockedDate && selectedDrawerSpace && !selectedBooking)}
                    title={selectedDrawerSpace?.title || "Untitled space"}
                    subtitle="Blocked availability"
                    onClose={closeDrawer}
                >
                    {selectedBlockedDate && selectedDrawerSpace && (
                        <BlockedDateDrawer
                            blockedDate={selectedBlockedDate}
                            space={selectedDrawerSpace}
                            onRemove={() => handleRemoveBlockedDate(selectedBlockedDate)}
                        />
                    )}
                </SideDrawer>

                <SlotBlockModal
                    open={slotModalOpen}
                    space={selectedSlotSpace}
                    bookingType={bookingType}
                    slotSaving={slotSaving}
                    slotError={slotError}
                    selectedSlotBlockedDate={selectedSlotBlockedDate}
                    slotStartInput={slotStartInput}
                    setSlotStartInput={setSlotStartInput}
                    slotEndInput={slotEndInput}
                    setSlotEndInput={setSlotEndInput}
                    blockReason={blockReason}
                    setBlockReason={setBlockReason}
                    onClose={closeSlotModal}
                    onSave={handleSaveSlotBlock}
                />
            </main>
        </RequireAuth>
    );
}