"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CRM_PRESET_VIEWS,
  clearActivePresetSearchParams,
  presetFiltersToSearchParams,
  type CrmPresetView,
} from "@/lib/crm-desktop/preset-views";

export function CrmPresetViewBar({
  scope,
}: {
  scope: CrmPresetView["scope"];
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const activePreset = searchParams.get("preset");

  const presets = CRM_PRESET_VIEWS.filter((view) => view.scope === scope);

  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const isActive = activePreset === preset.key;
        const params = presetFiltersToSearchParams(preset);
        const view = searchParams.get("view");
        if (view) params.set("view", view);
        const href = `${pathname}?${params.toString()}`;
        return (
          <Link
            key={preset.key}
            href={href}
            title={preset.description}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              isActive
                ? "bg-[#c1121f] text-white"
                : "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-[#c1121f]/30"
            }`}
          >
            {preset.label}
          </Link>
        );
      })}
      {activePreset ? (
        <button
          type="button"
          onClick={() => {
            const next = clearActivePresetSearchParams(searchParams, activePreset);
            const qs = next.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
          }}
          className="rounded-full px-3 py-1 text-xs text-gray-500 hover:text-[#c1121f]"
        >
          Clear preset
        </button>
      ) : null}
    </div>
  );
}
