import Link from "next/link";

/**
 * Compact Hosting workspace presentation primitives.
 * Access, commercial state, and booking behaviour stay in existing helpers.
 */

export const hostingPrimaryActionClass =
  "inline-flex items-center justify-center rounded-md bg-[#0c1d2f] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c1d2f] focus-visible:ring-offset-2";

export const hostingSecondaryActionClass =
  "inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0c1d2f] transition hover:bg-[#fbfcfd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c1d2f] focus-visible:ring-offset-2";

const SUMMARY_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
};

export function HostingSectionLabel({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500"
    >
      {children}
    </h2>
  );
}

export type HostingSummaryItem = {
  label: string;
  value: string | number;
  href?: string;
  attention?: boolean;
  hint?: string;
};

export function HostingSummaryStrip({
  items,
  label = "Summary",
}: {
  items: HostingSummaryItem[];
  label?: string;
}) {
  if (items.length === 0) return null;
  const gridClass = SUMMARY_GRID[Math.min(items.length, 6)] || SUMMARY_GRID[4];
  return (
    <section aria-label={label}>
      <div className={`grid overflow-hidden rounded-lg border border-gray-200 bg-white ${gridClass}`}>
        {items.map((item, index) => {
          const content = (
            <>
              <p
                className={`text-xl font-semibold tabular-nums tracking-tight ${
                  item.attention ? "text-[#c1121f]" : "text-[#0c1d2f]"
                }`}
              >
                {item.value}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{item.label}</p>
              {item.hint ? (
                <p className="mt-0.5 text-[11px] text-gray-400">{item.hint}</p>
              ) : null}
            </>
          );
          const className = `block px-3 py-3 sm:px-4 ${
            index > 0 ? "border-t border-gray-100 sm:border-t-0 sm:border-l" : ""
          } ${item.attention ? "bg-red-50/40" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0c1d2f]`;
          if (item.href) {
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`${className} hover:bg-[#fbfcfd]`}
              >
                {content}
              </Link>
            );
          }
          return (
            <div key={item.label} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HostingWorkspaceList({
  labelledBy,
  children,
}: {
  labelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="list"
      aria-labelledby={labelledBy}
      className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      {children}
    </div>
  );
}

export function HostingWorkspaceRow({
  title,
  description,
  href,
  status,
  attention = false,
}: {
  title: string;
  description: string;
  href: string;
  status: string;
  attention?: boolean;
}) {
  return (
    <Link
      role="listitem"
      href={href}
      className="flex items-start justify-between gap-3 px-3.5 py-3 transition hover:bg-[#fbfcfd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0c1d2f]"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#0c1d2f]">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
          {description}
        </p>
      </div>
      <span
        className={`shrink-0 pt-0.5 text-xs font-medium ${
          attention ? "text-[#c1121f]" : "text-gray-500"
        }`}
      >
        {status}
      </span>
    </Link>
  );
}

export type HostingOpsItem = {
  label: string;
  value: string;
  href: string;
  detail?: string;
  tone?: "default" | "ready" | "attention";
};

export function HostingOpsStrip({ items }: { items: HostingOpsItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-gray-100">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 border-t border-gray-100 px-3.5 py-3 first:border-t-0 sm:border-t-0 ${
              item.tone === "attention" ? "bg-amber-50/50" : ""
            } ${
              item.tone === "ready" ? "bg-emerald-50/40" : ""
            } hover:bg-[#fbfcfd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0c1d2f]`}
          >
            <span className="text-xs font-medium text-gray-500">{item.label}</span>
            <span className="min-w-0 text-right">
              <span
                className={`block text-sm font-semibold ${
                  item.tone === "attention"
                    ? "text-amber-900"
                    : item.tone === "ready"
                      ? "text-emerald-800"
                      : "text-[#0c1d2f]"
                }`}
              >
                {item.value}
              </span>
              {item.detail ? (
                <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                  {item.detail}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function HostingToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {children}
    </div>
  );
}

export function HostingSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-gray-200 bg-white py-1.5 px-3 text-sm outline-none focus:border-[#0c1d2f] focus-visible:ring-2 focus-visible:ring-[#0c1d2f]"
      />
    </div>
  );
}

export function HostingFilterChip({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count?: number;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c1d2f] focus-visible:ring-offset-2 ${
        active
          ? "bg-[#0c1d2f] text-white"
          : "bg-white text-[#334155] ring-1 ring-gray-200 hover:bg-[#fbfcfd]"
      }`}
    >
      <span>{children}</span>
      {typeof count === "number" ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
            active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
