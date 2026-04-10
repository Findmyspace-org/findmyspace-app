"use client";

type OwnerTimelineBarProps = {
  label: string;
  className: string;
  style: { left: string; width: string };
  kind?: "booking" | "blocked";
};

export default function OwnerTimelineBar({
  label,
  className,
  style,
  kind = "booking",
}: OwnerTimelineBarProps) {
  return (
    <div
      className={`absolute top-1/2 flex h-6 -translate-y-1/2 items-center rounded-full px-2 text-[11px] font-medium leading-6 shadow-sm ${className} ${
        kind === "blocked"
          ? "bg-[repeating-linear-gradient(135deg,rgba(156,163,175,1)_0px,rgba(156,163,175,1)_10px,rgba(107,114,128,1)_10px,rgba(107,114,128,1)_20px)] text-white"
          : ""
      }`}
      style={style}
      title={label}
    >
      {kind === "booking" && (
        <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-white/80" />
      )}
      <span className="truncate">{label}</span>
      {kind === "booking" && (
        <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-white/80" />
      )}
    </div>
  );
}