"use client";

import { ReactNode } from "react";
import type { OwnerTimelineColumn } from "./OwnerTimelineHeader";

type OwnerTimelineRowProps = {
  label: string;
  columns: OwnerTimelineColumn[];
  bookingUnit: string | null;
  children?: ReactNode;
  withTopBorder?: boolean;
};

function OwnerTimelineGrid({
  columns,
  bookingUnit,
}: {
  columns: OwnerTimelineColumn[];
  bookingUnit: string | null;
}) {
  return (
    <div className={`grid h-full ${bookingUnit === "month" ? "grid-cols-8" : "grid-cols-12"}`}>
      {columns.map((col) => (
        <div key={col.key} className="border-r border-gray-200 last:border-r-0" />
      ))}
    </div>
  );
}

export default function OwnerTimelineRow({
  label,
  columns,
  bookingUnit,
  children,
  withTopBorder = true,
}: OwnerTimelineRowProps) {
  return (
    <div className={`grid grid-cols-[120px_1fr] ${withTopBorder ? "border-t border-gray-200" : ""}`}>
      <div className="border-r border-gray-200 bg-[#f8fafb] p-3 text-xs font-medium text-gray-600">
        {label}
      </div>
      <div className="relative h-12 bg-white">
        <OwnerTimelineGrid columns={columns} bookingUnit={bookingUnit} />
        {children}
      </div>
    </div>
  );
}