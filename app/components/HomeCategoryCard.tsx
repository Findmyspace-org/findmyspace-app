"use client";

import Image from "next/image";

type HomeCategoryCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  selected: boolean;
  onClick: () => void;
};

export default function HomeCategoryCard({
  title,
  description,
  imageSrc,
  selected,
  onClick,
}: HomeCategoryCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`group relative flex h-[7.25rem] w-full overflow-hidden rounded-2xl border border-white/40 bg-white/80 text-left shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 motion-reduce:transition-none sm:h-[8.25rem] ${
        selected
          ? "-translate-y-0.5 ring-2 ring-red-500/20 shadow-[0_10px_30px_rgba(220,38,38,0.12)]"
          : "hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(0,0,0,0.1)]"
      }`}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3 sm:px-4 sm:py-3.5">
        <span className="text-[0.8125rem] font-semibold leading-snug text-[#0f172a] sm:text-sm">
          {title}
        </span>
        <span className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#64748b] sm:text-[11px]">
          {description}
        </span>
      </div>

      <div className="relative h-full w-[44%] shrink-0 overflow-hidden sm:w-[46%]">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 768px) 44vw, 220px"
          className={`object-cover object-center transition-transform duration-300 ease-out motion-reduce:transform-none ${
            selected ? "scale-[1.02]" : "group-hover:scale-105"
          }`}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white from-0% via-white/85 via-[28%] to-transparent to-[72%]"
          aria-hidden
        />
      </div>
    </button>
  );
}
