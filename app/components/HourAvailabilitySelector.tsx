"use client";

import { useEffect, useMemo, useState } from "react";

type ExistingBooking = {
    id: string;
    start_at: string;
    end_at: string;
    status: string | null;
};

type BlockedDate = {
    id: string;
    space_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
};

type Props = {
    selectedDate: string;
    existingBookings: ExistingBooking[];
    blockedDates: BlockedDate[];
    onChange: (start: string, end: string) => void;
};

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && aEnd > bStart;
}

function parseDateParts(date: string) {
    const [year, month, day] = date.replace(/\//g, "-").split("-").map(Number);
    return { year, month, day };
}

function buildDateTime(date: string, hour: number) {
    const { year, month, day } = parseDateParts(date);

    // Hour bookings must be interpreted in the business timezone
    // (Africa/Johannesburg, UTC+2) so the public selector matches
    // the owner calendar exactly.
    return new Date(Date.UTC(year, month - 1, day, hour - 2, 0, 0, 0));
}

function formatHour(hour: number) {
    return `${String(hour).padStart(2, "0")}:00`;
}

function formatRangeLabel(date: string, visibleHours: number[]) {
    if (!visibleHours.length) return date;

    const first = visibleHours[0];
    const last = visibleHours[visibleHours.length - 1] + 1;

    return `${date} · ${formatHour(first)} - ${formatHour(last)}`;
}

function normalizeDateString(date: string) {
    const { year, month, day } = parseDateParts(date);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function HourAvailabilitySelector({
    selectedDate,
    existingBookings,
    blockedDates,
    onChange,
}: Props) {
    const [startHour, setStartHour] = useState<number | null>(null);
    const [endHour, setEndHour] = useState<number | null>(null);
    const [selectionMessage, setSelectionMessage] = useState("");

    const [windowStartHour, setWindowStartHour] = useState(7);

    const visibleHourCount = 12;
    const minHour = 0;
    const maxHour = 23;

    const blockingStatuses = [
        "approved",
        "accepted_awaiting_payment",
        "awaiting_payment",
        "paid_confirmed",
        "confirmed",
        "completed",
    ];

    const pendingStatuses = ["pending", "pending_owner"];

    useEffect(() => {
        setStartHour(null);
        setEndHour(null);
        setWindowStartHour(7);
        setSelectionMessage("");
        onChange("", "");
        // Reset only when the date changes. Do not depend on onChange here,
        // because a new callback reference from the parent can cause the
        // selection to reset after each click.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    const canGoEarlier = windowStartHour > minHour;
    const canGoLater = windowStartHour + visibleHourCount - 1 < maxHour;

    const visibleHours = useMemo(() => {
        return Array.from({ length: visibleHourCount }, (_, i) => windowStartHour + i).filter(
            (hour) => hour >= minHour && hour <= maxHour
        );
    }, [windowStartHour]);

    const rangeLabel = useMemo(() => {
        return formatRangeLabel(selectedDate, visibleHours);
    }, [selectedDate, visibleHours]);

    const hourBlocks = useMemo(() => {
        return visibleHours.map((hour) => {
            const blockStart = buildDateTime(selectedDate, hour);
            const blockEnd = buildDateTime(selectedDate, hour + 1);

            const isBlocked = existingBookings.some(
                (booking) =>
                    blockingStatuses.includes(booking.status || "") &&
                    overlaps(
                        blockStart,
                        blockEnd,
                        new Date(booking.start_at),
                        new Date(booking.end_at)
                    )
            );

            const isPending = existingBookings.some(
                (booking) =>
                    pendingStatuses.includes(booking.status || "") &&
                    overlaps(
                        blockStart,
                        blockEnd,
                        new Date(booking.start_at),
                        new Date(booking.end_at)
                    )
            );

            const isBlockedByOwner = blockedDates.some((blocked) =>
                overlaps(
                    blockStart,
                    blockEnd,
                    new Date(blocked.start_at),
                    new Date(blocked.end_at)
                )
            );

            const isStart = startHour === hour;
            const isSelected =
                startHour !== null &&
                endHour !== null &&
                hour >= startHour &&
                hour < endHour;

            return {
                hour,
                isBlocked,
                isBlockedByOwner,
                isPending,
                isStart,
                isSelected,
            };
        });
    }, [visibleHours, existingBookings, blockedDates, selectedDate, startHour, endHour]);

    function handleClick(
        hour: number,
        isBlocked: boolean,
        isBlockedByOwner: boolean,
        isPending: boolean
    ) {
        setSelectionMessage("");

        if (isBlocked || isBlockedByOwner || isPending) {
            setSelectionMessage("Time not available");
            return;
        }

        if (startHour === null) {
            setStartHour(hour);
            setEndHour(null);
            onChange("", "");
            return;
        }

        if (endHour === null) {
            if (hour === startHour) {
                return;
            }

            if (hour < startHour) {
                setStartHour(hour);
                setEndHour(null);
                onChange("", "");
                return;
            }

            const proposedStart = buildDateTime(selectedDate, startHour);
            const proposedEnd = buildDateTime(selectedDate, hour + 1);

            const hasBookingConflictInsideRange = existingBookings.some((booking) => {
                const isBlocking =
                    blockingStatuses.includes(booking.status || "") ||
                    pendingStatuses.includes(booking.status || "");

                if (!isBlocking) return false;

                return overlaps(
                    proposedStart,
                    proposedEnd,
                    new Date(booking.start_at),
                    new Date(booking.end_at)
                );
            });

            const hasBlockedOwnerConflictInsideRange = blockedDates.some((blocked) =>
                overlaps(
                    proposedStart,
                    proposedEnd,
                    new Date(blocked.start_at),
                    new Date(blocked.end_at)
                )
            );

            if (hasBookingConflictInsideRange || hasBlockedOwnerConflictInsideRange) {
                setSelectionMessage("Time not available");
                return;
            }

            setEndHour(hour + 1);

            const normalizedDate = normalizeDateString(selectedDate);
            const start = `${normalizedDate}T${String(startHour).padStart(2, "0")}:00:00`;
            const end = `${normalizedDate}T${String(hour + 1).padStart(2, "0")}:00:00`;

            onChange(start, end);
            return;
        }

        if (hour === startHour) {
            return;
        }

        setStartHour(hour);
        setEndHour(null);
        onChange("", "");
    }

    function getClass(block: {
        isBlocked: boolean;
        isBlockedByOwner: boolean;
        isPending: boolean;
        isStart: boolean;
        isSelected: boolean;
    }) {
        if (block.isSelected || block.isStart) {
            return "border-green-500 bg-green-500 text-white";
        }

        if (block.isBlocked || block.isBlockedByOwner || block.isPending) {
            return "cursor-not-allowed border-gray-200 bg-[repeating-linear-gradient(135deg,rgba(229,231,235,1)_0px,rgba(229,231,235,1)_10px,rgba(209,213,219,1)_10px,rgba(209,213,219,1)_20px)] text-gray-700";
        }

        return "cursor-pointer border-gray-200 bg-white text-[#192a3a] hover:bg-gray-50";
    }

    return (
        <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#192a3a]">Select time</h3>
                    <p className="text-xs text-gray-500">
                        Click a start time, then an end time
                    </p>
                    {selectionMessage ? (
                        <p className="mt-2 text-xs font-medium text-red-600">
                            {selectionMessage}
                        </p>
                    ) : null}
                </div>

                <div className="flex w-full min-w-0 max-w-full flex-col gap-2 sm:items-end">
                    <div className="flex min-w-0 items-center justify-center gap-2 sm:justify-end">
                        <button
                            type="button"
                            onClick={() =>
                                canGoEarlier && setWindowStartHour((current) => Math.max(minHour, current - 6))
                            }
                            disabled={!canGoEarlier}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] disabled:opacity-40"
                            aria-label="Earlier hours"
                        >
                            ←
                        </button>

                        <div className="min-w-0 max-w-[min(100%,11rem)] flex-1 text-center text-[11px] font-medium leading-snug text-[#192a3a] sm:max-w-none sm:min-w-[190px] sm:flex-none sm:text-sm">
                            {rangeLabel}
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                canGoLater &&
                                setWindowStartHour((current) =>
                                    Math.min(maxHour - visibleHourCount + 1, current + 6)
                                )
                            }
                            disabled={!canGoLater}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-[#192a3a] disabled:opacity-40"
                            aria-label="Later hours"
                        >
                            →
                        </button>
                    </div>

                    <div className="flex w-full justify-center sm:w-auto sm:justify-end">
                        <button
                            type="button"
                            onClick={() => setWindowStartHour(7)}
                            className="w-full max-w-[12rem] rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-[#192a3a] sm:w-auto sm:max-w-none"
                        >
                            Today
                        </button>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
                    {hourBlocks.map((block) => (
                        <button
                            key={block.hour}
                            type="button"
                            onClick={() =>
                                handleClick(
                                    block.hour,
                                    block.isBlocked,
                                    block.isBlockedByOwner,
                                    block.isPending
                                )
                            }
                            disabled={block.isBlocked || block.isBlockedByOwner || block.isPending}
                            className={`flex h-[84px] w-full items-center justify-center border-r border-b border-gray-200 px-2 last:border-r-0 ${getClass(
                                block
                            )}`}
                        >
                            <div className="flex h-full w-full flex-col items-center justify-center text-center leading-none">
                                <div className="text-sm font-semibold">
                                    {String(block.hour).padStart(2, "0")}
                                </div>
                                <div className="mt-1 text-[11px] opacity-70">:00</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {(startHour !== null || endHour !== null) && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                        <div className="text-gray-500">Start time</div>
                        <div className="font-medium text-[#192a3a]">
                            {startHour !== null ? `${String(startHour).padStart(2, "0")}:00` : "-"}
                        </div>
                    </div>

                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                        <div className="text-gray-500">End time</div>
                        <div className="font-medium text-[#192a3a]">
                            {endHour !== null ? `${String(endHour).padStart(2, "0")}:00` : "-"}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-gray-600">
                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded border border-gray-300 bg-white" />
                    Available
                </div>

                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-green-500" />
                    Selected
                </div>

                <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded bg-[repeating-linear-gradient(135deg,rgba(229,231,235,1)_0px,rgba(229,231,235,1)_10px,rgba(209,213,219,1)_10px,rgba(209,213,219,1)_20px)]" />
                    Unavailable
                </div>
            </div>
        </div>
    );
}