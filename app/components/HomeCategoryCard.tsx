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
      className={`group relative flex h-[5rem] w-full overflow-hidden rounded-xl border border-white/40 bg-white text-left shadow-[0_6px_22px_rgba(0,0,0,0.07)] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30 focus-visible:ring-offset-2 motion-reduce:transition-none md:h-[6.125rem] md:rounded-2xl md:bg-white/95 md:shadow-[0_8px_30px_rgba(0,0,0,0.08)] ${
        selected
          ? "-translate-y-0.5 ring-2 ring-red-500/20 shadow-[0_10px_30px_rgba(220,38,38,0.12)]"
          : "hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(0,0,0,0.1)]"
      }`}
    >
      <div className="relative z-10 flex w-[45%] min-w-0 flex-col justify-center px-2 py-1.5 md:px-3.5 md:py-2.5">
        <span className="text-[11px] font-semibold leading-tight text-[#0f172a] md:text-[0.8125rem] md:text-sm">
          {title}
        </span>
        <span className="mt-0 line-clamp-1 text-[9px] leading-[1.3] text-[#64748b] md:mt-0.5 md:line-clamp-2 md:text-[11px] md:leading-[1.35]">
          {description}
        </span>
      </div>

      <div className="relative h-full w-[55%] shrink-0 overflow-hidden">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 768px) 55vw, 260px"
          className={`object-cover object-[center_42%] transition-transform duration-300 ease-out motion-reduce:transform-none ${
            selected ? "scale-[1.02]" : "group-hover:scale-[1.04]"
          }`}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white from-0% via-white/70 via-[22%] via-white/25 via-[42%] to-transparent to-[88%]"
          aria-hidden
        />
      </div>
    </button>
  );
}
