"use client";

import {
  getOptionLabel,
  getSpaceFeatureLayout,
  normalizeFeatureAttributes,
  toCanonicalFeatureKey,
  type SpaceFeatureSection,
} from "@/app/data/spaceFeatureConfig";
import { spaceFieldConfig, type SpaceField } from "@/app/data/spaceFieldConfig";
import { SpaceFeatureIcon } from "@/app/components/space-feature-icons";
import {
  ShieldCheck,
  Wifi,
  Clock,
  Users,
  Monitor,
  KeyRound,
  Thermometer,
  Car,
  Ruler,
  Zap,
  Droplet,
  Briefcase,
  Volume2,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = {
  spaceType: string | null;
  attributes: Record<string, string[]>;
  /** Omit sections rendered elsewhere (e.g. suitable_for on public event listings). */
  excludeSectionIds?: string[];
};

const legacyIconMap: Record<string, LucideIcon> = {
  shield: ShieldCheck,
  wifi: Wifi,
  clock: Clock,
  users: Users,
  monitor: Monitor,
  key: KeyRound,
  climate: Thermometer,
  car: Car,
  ruler: Ruler,
  power: Zap,
  water: Droplet,
  briefcase: Briefcase,
  volume: Volume2,
  note: FileText,
};

function getLegacyField(
  spaceType: string,
  key: string
): SpaceField | undefined {
  const fields = spaceFieldConfig[spaceType];
  return fields?.find((f) => f.key === key);
}

type FeatureItem = {
  key: string;
  label: string;
  iconName?: string;
  legacyIcon?: string;
  isBoolean: boolean;
  valueText?: string;
};

type FeatureGroup = {
  id: string;
  title: string;
  items: FeatureItem[];
};

function formatLegacyItem(
  spaceType: string,
  key: string,
  values: string[]
): FeatureItem | null {
  if (values.length === 0) return null;
  const field = getLegacyField(spaceType, key);
  if (!field) return null;

  if (field.type === "boolean") {
    if (values[0] !== "yes") return null;
    return {
      key,
      label: field.label,
      legacyIcon: field.icon,
      isBoolean: true,
    };
  }

  if (field.type === "multiselect" || field.type === "select") {
    const text = values
      .map((value) => {
        const option = field.options?.find((item) => item.value === value);
        return option?.label || value;
      })
      .join(", ");
    if (!text) return null;
    return {
      key,
      label: field.label,
      legacyIcon: field.icon,
      isBoolean: false,
      valueText: text,
    };
  }

  const text = values.join(", ");
  if (!text) return null;
  return {
    key,
    label: field.label,
    legacyIcon: field.icon,
    isBoolean: false,
    valueText: text,
  };
}

function FeatureGlyph({
  iconName,
  legacyIcon,
}: {
  iconName?: string;
  legacyIcon?: string;
}) {
  if (iconName) {
    return <SpaceFeatureIcon name={iconName} className="h-4 w-4" />;
  }
  if (legacyIcon) {
    const Icon = legacyIconMap[legacyIcon];
    return Icon ? <Icon className="h-4 w-4" /> : null;
  }
  return null;
}

function SuitableForChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#d7dde3] bg-white px-3 py-1.5 text-xs font-medium text-[#334155]">
      {label}
    </span>
  );
}

function FeatureCard({ item }: { item: FeatureItem }) {
  if (item.isBoolean) {
    return (
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#c1121f] sm:h-8 sm:w-8">
          <FeatureGlyph iconName={item.iconName} legacyIcon={item.legacyIcon} />
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-[#0f172a] sm:text-[0.9375rem]">
          {item.label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] sm:h-8 sm:w-8">
        <FeatureGlyph iconName={item.iconName} legacyIcon={item.legacyIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium leading-tight text-[#64748b] sm:text-xs">
          {item.label}
        </p>
        <p className="mt-0.5 break-words text-sm font-semibold leading-tight text-[#0f172a] sm:text-[0.9375rem]">
          {item.valueText}
        </p>
      </div>
    </div>
  );
}

function sectionFields(sec: SpaceFeatureSection) {
  return [
    ...sec.fields,
    ...(sec.subsections?.flatMap((sub) => sub.fields) ?? []),
  ];
}

export default function SpaceAttributesDisplay({
  spaceType,
  attributes,
  excludeSectionIds = [],
}: Props) {
  if (!spaceType) return null;

  const normalizedAttributes = normalizeFeatureAttributes(attributes);
  const excluded = new Set(excludeSectionIds);

  const allKeys = Object.keys(normalizedAttributes).filter(
    (k) => (normalizedAttributes[k] || []).length > 0
  );

  if (allKeys.length === 0) return null;

  const layout = getSpaceFeatureLayout(spaceType);
  const usedCanonical = new Set<string>();
  const groups: FeatureGroup[] = [];

  for (const sec of layout.sections) {
    if (excluded.has(sec.id)) continue;

    const items: FeatureItem[] = [];

    for (const field of sectionFields(sec)) {
      const canonical = toCanonicalFeatureKey(field.key);
      const values = normalizedAttributes[canonical] || [];
      if (values.length === 0) continue;
      usedCanonical.add(canonical);

      if (field.kind === "checkbox") {
        if (!values.includes("yes")) continue;
        items.push({
          key: canonical,
          label: field.label,
          iconName: field.icon,
          isBoolean: true,
        });
      } else if (field.kind === "radio") {
        const v = values[0];
        if (!v) continue;
        items.push({
          key: canonical,
          label: field.label,
          iconName: field.icon,
          isBoolean: false,
          valueText: getOptionLabel(field, v),
        });
      } else if (field.kind === "multiselect") {
        const text = values
          .map((v) => getOptionLabel(field, v))
          .filter(Boolean)
          .join(", ");
        if (!text) continue;
        items.push({
          key: canonical,
          label: field.label,
          iconName: field.icon,
          isBoolean: false,
          valueText: text,
        });
      }
    }

    if (items.length > 0) {
      groups.push({ id: sec.id, title: sec.title, items });
    }
  }

  const legacyItems: FeatureItem[] = [];
  for (const key of allKeys) {
    const canonical = toCanonicalFeatureKey(key);
    if (usedCanonical.has(canonical)) continue;
    const item = formatLegacyItem(
      spaceType,
      canonical,
      normalizedAttributes[canonical] || []
    );
    if (item) legacyItems.push(item);
  }
  if (legacyItems.length > 0) {
    groups.push({
      id: "legacy_additional",
      title: "Additional details",
      items: legacyItems,
    });
  }

  if (groups.length === 0) return null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {groups.map((group) => (
        <div key={group.id} className="space-y-2.5 sm:space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748b] sm:text-sm sm:tracking-normal sm:normal-case sm:text-[#0f172a]">
            {group.title}
          </h3>
          {group.id === "suitable_for" ? (
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <SuitableForChip key={item.key} label={item.label} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <FeatureCard key={item.key} item={item} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
