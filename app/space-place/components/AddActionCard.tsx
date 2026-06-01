import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function AddActionCard({
  href,
  onClick,
  title,
  description,
  icon: Icon,
  accent,
}: {
  href?: string;
  onClick?: () => void;
  title: string;
  description: string;
  icon: LucideIcon;
  accent?: boolean;
}) {
  const className = `flex w-full gap-4 rounded-2xl border p-4 text-left shadow-sm transition active:scale-[0.99] ${
    accent
      ? "border-[#c1121f]/30 bg-[#c1121f]/5"
      : "border-neutral-200 bg-white"
  }`;

  const inner = (
    <>
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          accent ? "bg-[#c1121f] text-white" : "bg-neutral-100 text-neutral-700"
        }`}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-neutral-900">{title}</span>
        <span className="mt-1 block text-sm leading-snug text-neutral-600">
          {description}
        </span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}
