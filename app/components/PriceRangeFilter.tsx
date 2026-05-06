"use client";

import { useEffect } from "react";
import {
  Clock,
  Calendar,
  CalendarDays,
} from "lucide-react";

type Props = {
  bookingUnitFilter: string;
  setBookingUnitFilter: React.Dispatch<React.SetStateAction<string>>;
  minPrice: number;
  maxPrice: number;
  setMinPrice: React.Dispatch<React.SetStateAction<number>>;
  setMaxPrice: React.Dispatch<React.SetStateAction<number>>;
  absoluteMin?: number;
  absoluteMax?: number;
  step?: number;
  compact?: boolean;
};

export default function PriceRangeFilter({
  bookingUnitFilter,
  setBookingUnitFilter,
  minPrice,
  maxPrice,
  setMinPrice,
  setMaxPrice,
  absoluteMin = 0,
  absoluteMax = 20000,
  step = 50,
  compact = false,
}: Props) {
  const unitButtons = [
    { value: "all", label: "All", icon: null, max: 20000 },
    { value: "hour", label: "Hour", icon: Clock, max: 5000 },
    { value: "day", label: "Day", icon: Calendar, max: 10000 },
    { value: "month", label: "Month", icon: CalendarDays, max: 20000 },
  ];

  const selectedUnit =
    unitButtons.find((u) => u.value === bookingUnitFilter) || unitButtons[0];

  const dynamicMax = selectedUnit.max;

  function snap(value: number) {
    return Math.round(value / step) * step;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function handleMinInputChange(value: string) {
    const parsed = Number(value || 0);
    const snapped = snap(parsed);
    const clamped = clamp(snapped, absoluteMin, maxPrice);
    setMinPrice(clamped);
  }

  function handleMaxInputChange(value: string) {
    const parsed = Number(value || 0);
    const snapped = snap(parsed);
    const clamped = clamp(snapped, minPrice, dynamicMax);
    setMaxPrice(clamped);
  }

  function handleMinSliderChange(value: string) {
    const parsed = snap(Number(value));
    const clamped = clamp(parsed, absoluteMin, maxPrice);
    setMinPrice(clamped);
  }

  function handleMaxSliderChange(value: string) {
    const parsed = snap(Number(value));
    const clamped = clamp(parsed, minPrice, dynamicMax);
    setMaxPrice(clamped);
  }

  useEffect(() => {
    if (maxPrice > dynamicMax) setMaxPrice(dynamicMax);
    if (minPrice > dynamicMax) setMinPrice(absoluteMin);
  }, [bookingUnitFilter]);

  const minPercent =
    ((minPrice - absoluteMin) / (dynamicMax - absoluteMin || 1)) * 100;

  const maxPercent =
    ((maxPrice - absoluteMin) / (dynamicMax - absoluteMin || 1)) * 100;

  return (
    <div
      className={
        compact
          ? "space-y-4 rounded-2xl border border-[#e5e7eb] bg-[#fbfcfd] p-4"
          : "space-y-5 rounded-md border border-white/40 bg-white/30 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl"
      }
    >
      {!compact ? <h3 className="text-lg font-semibold text-[#192a3a]">Price filter</h3> : null}

      {/* BOOKING UNIT */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-[#1e293b]">
          Booking unit
        </label>

        <div className={`${compact ? "grid grid-cols-4 gap-2" : "flex flex-nowrap gap-2 overflow-x-auto"}`}>
          {unitButtons.map((unit) => {
            const active = bookingUnitFilter === unit.value;
            const Icon = unit.icon;

            return (
              <button
                key={unit.value}
                type="button"
                onClick={() => setBookingUnitFilter(unit.value)}
                className={`flex items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                  active
                    ? "bg-[#c1121f] text-white shadow-[0_8px_14px_rgba(193,18,31,0.28)]"
                    : "border border-[#d5dde5] bg-white text-[#192a3a] hover:bg-[#f8fafc]"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {unit.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* PRICE RANGE */}
      <div>
        <p className="mb-2 text-sm font-semibold text-[#1e293b]">
          Price range
        </p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Min price
            </label>
            <input
              type="number"
              step={step}
              value={minPrice}
              onChange={(e) => handleMinInputChange(e.target.value)}
              className="w-full rounded-lg border border-[#d5dde5] bg-white px-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Max price
            </label>
            <input
              type="number"
              step={step}
              value={maxPrice}
              onChange={(e) => handleMaxInputChange(e.target.value)}
              className="w-full rounded-lg border border-[#d5dde5] bg-white px-3 py-2.5 text-right text-sm"
            />
          </div>
        </div>

        {/* SLIDER */}
        <div className="relative px-1 py-3">
          <div className="absolute left-1 right-1 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#e7ebf0]" />

          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#c1121f]"
            style={{
              left: `${minPercent}%`,
              right: `${100 - maxPercent}%`,
            }}
          />

          <input
            type="range"
            min={absoluteMin}
            max={dynamicMax}
            step={step}
            value={minPrice}
            onChange={(e) => handleMinSliderChange(e.target.value)}
            className="pointer-events-none absolute left-0 top-1/2 z-20 h-2 w-full -translate-y-1/2 appearance-none bg-transparent
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-[#c1121f]
            [&::-webkit-slider-thumb]:bg-[#c1121f]"
          />

          <input
            type="range"
            min={absoluteMin}
            max={dynamicMax}
            step={step}
            value={maxPrice}
            onChange={(e) => handleMaxSliderChange(e.target.value)}
            className="pointer-events-none absolute left-0 top-1/2 z-20 h-2 w-full -translate-y-1/2 appearance-none bg-transparent
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-[#c1121f]
            [&::-webkit-slider-thumb]:bg-[#c1121f]"
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>R{absoluteMin}</span>
          <span>Step: R{step}</span>
          <span>R{dynamicMax}</span>
        </div>
      </div>
    </div>
  );
}