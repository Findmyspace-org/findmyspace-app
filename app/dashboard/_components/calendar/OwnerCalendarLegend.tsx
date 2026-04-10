"use client";

export default function OwnerCalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-yellow-500" />
        Pending
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-blue-500" />
        Awaiting payment
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-green-500" />
        Confirmed
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-gray-400" />
        Blocked
      </span>
    </div>
  );
}