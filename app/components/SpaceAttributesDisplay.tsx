"use client";

import { spaceFieldConfig } from "@/app/data/spaceFieldConfig";
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

type Props = {
  spaceType: string | null;
  attributes: Record<string, string[]>;
};

const iconMap = {
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

export default function SpaceAttributesDisplay({
  spaceType,
  attributes,
}: Props) {
  if (!spaceType) return null;

  const fields = spaceFieldConfig[spaceType] || [];
  if (fields.length === 0) return null;

  function getDisplayValue(key: string) {
    const values = attributes[key] || [];
    if (values.length === 0) return null;

    const field = fields.find((item) => item.key === key);

    if (!field) return values.join(", ");

    if (field.type === "multiselect" || field.type === "select") {
      return values
        .map((value) => {
          const option = field.options?.find((item) => item.value === value);
          return option?.label || value;
        })
        .join(", ");
    }

    if (field.type === "boolean") {
      return values[0] === "yes" ? "Yes" : "No";
    }

    return values.join(", ");
  }

  function renderIcon(iconName?: string) {
    if (!iconName) return null;

    const Icon = iconMap[iconName as keyof typeof iconMap];
    if (!Icon) return null;

    return <Icon size={18} />;
  }

  const visibleFields = fields.filter(
    (field) => (attributes[field.key] || []).length > 0
  );

  if (visibleFields.length === 0) return null;

  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-[#192a3a]">
        Space details
      </h2>

      <div className="grid gap-y-5 gap-x-10 sm:grid-cols-2 text-sm">
        {visibleFields.map((field) => (
          <div key={field.key} className="flex items-start gap-3">
            <div className="mt-1 text-gray-500">
              {renderIcon(field.icon)}
            </div>

            <div>
              <p className="text-gray-500">{field.label}</p>
              <p className="font-medium text-[#192a3a]">
                {getDisplayValue(field.key)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}