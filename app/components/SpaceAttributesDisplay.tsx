"use client";

import {
  getSpaceFeatureField,
  getOptionLabel,
  normalizeFeatureAttributes,
  toCanonicalFeatureKey,
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

function formatNewFeatureDisplay(
  key: string,
  values: string[]
): { label: string; text: string; iconName: string } | null {
  if (values.length === 0) return null;

  const field = getSpaceFeatureField(key);
  if (!field) return null;

  if (field.kind === "checkbox") {
    if (!values.includes("yes")) return null;
    return { label: field.label, text: "Yes", iconName: field.icon };
  }

  if (field.kind === "radio") {
    const v = values[0];
    if (!v) return null;
    return {
      label: field.label,
      text: getOptionLabel(field, v),
      iconName: field.icon,
    };
  }

  if (field.kind === "multiselect") {
    const text = values
      .map((v) => getOptionLabel(field, v))
      .filter(Boolean)
      .join(", ");
    if (!text) return null;
    return { label: field.label, text, iconName: field.icon };
  }

  return null;
}

function formatLegacyDisplay(
  spaceType: string,
  key: string,
  values: string[]
): { label: string; text: string; legacyIcon?: string } | null {
  if (values.length === 0) return null;

  const field = getLegacyField(spaceType, key);
  if (!field) return null;

  if (field.type === "multiselect" || field.type === "select") {
    const text = values
      .map((value) => {
        const option = field.options?.find((item) => item.value === value);
        return option?.label || value;
      })
      .join(", ");
    return { label: field.label, text, legacyIcon: field.icon };
  }

  if (field.type === "boolean") {
    return {
      label: field.label,
      text: values[0] === "yes" ? "Yes" : "No",
      legacyIcon: field.icon,
    };
  }

  return {
    label: field.label,
    text: values.join(", "),
    legacyIcon: field.icon,
  };
}

export default function SpaceAttributesDisplay({
  spaceType,
  attributes,
}: Props) {
  if (!spaceType) return null;

  const normalizedAttributes = normalizeFeatureAttributes(attributes);

  const keys = Object.keys(normalizedAttributes).filter(
    (k) => (normalizedAttributes[k] || []).length > 0
  );

  if (keys.length === 0) return null;

  const rows: Array<{
    key: string;
    label: string;
    text: string;
    iconName?: string;
    legacyIcon?: string;
  }> = [];

  for (const key of keys) {
    const canonicalKey = toCanonicalFeatureKey(key);
    const values = normalizedAttributes[canonicalKey] || [];

    const modern = formatNewFeatureDisplay(canonicalKey, values);
    if (modern) {
      rows.push({
        key: canonicalKey,
        label: modern.label,
        text: modern.text,
        iconName: modern.iconName,
      });
      continue;
    }

    const legacy = formatLegacyDisplay(spaceType, canonicalKey, values);
    if (legacy) {
      rows.push({
        key,
        label: legacy.label,
        text: legacy.text,
        legacyIcon: legacy.legacyIcon,
      });
    }
  }

  if (rows.length === 0) return null;

  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-[#192a3a]">Space details</h2>

      <div className="grid gap-y-4 gap-x-8 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-3">
            <div className="mt-0.5 text-gray-500">
              {row.iconName ? (
                <SpaceFeatureIcon name={row.iconName} className="h-4 w-4" />
              ) : row.legacyIcon ? (
                (() => {
                  const Icon = legacyIconMap[row.legacyIcon];
                  return Icon ? <Icon size={18} /> : null;
                })()
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="text-gray-500">{row.label}</p>
              <p className="font-medium text-[#192a3a] break-words">{row.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
