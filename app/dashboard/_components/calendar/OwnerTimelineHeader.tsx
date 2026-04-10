"use client";

export type OwnerTimelineColumn = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

type OwnerTimelineHeaderProps = {
  columns: OwnerTimelineColumn[];
  bookingUnit: string | null;
  title?: string;
};

export default function OwnerTimelineHeader({
  columns,
  bookingUnit,
  title = "Calendar",
}: OwnerTimelineHeaderProps) {
  return (
    <div
      className={`grid border-b border-gray-200 ${
        bookingUnit === "month"
          ? "grid-cols-[120px_repeat(8,minmax(0,1fr))]"
          : "grid-cols-[120px_repeat(12,minmax(0,1fr))]"
      }`}
    >
      <div className="border-r border-gray-200 bg-[#f8fafb] p-3 text-sm font-semibold text-[#192a3a]">
        {title}
      </div>
      {columns.map((col) => (
        <div
          key={col.key}
          className="border-r border-gray-200 px-2 py-3 text-center text-xs text-gray-600 last:border-r-0"
        >
          {col.label}
        </div>
      ))}
    </div>
  );
}