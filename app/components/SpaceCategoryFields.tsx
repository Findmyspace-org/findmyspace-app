"use client";

import {
  Car,
  Shield,
  Key,
  Lock,
  Warehouse,
  Ruler,
  Building,
  Camera,
  DoorOpen,
  MapPin,
  CircleDollarSign,
  Clock3,
  Square,
  Layers3,
  Fence,
  AlarmSmoke,
  UserCheck,
  Package,
  Wrench,
  Grid3X3,
  CheckSquare,
  FileText,
  CircleHelp,
  Warehouse as IndoorOutdoorIcon,
  Thermometer,
} from "lucide-react";
import { spaceFieldConfig } from "@/app/data/spaceFieldConfig";

type AttributeState = Record<string, string[]>;

type FieldOption = {
  value: string;
  label: string;
};

type FieldConfig = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "multiselect";
  placeholder?: string;
  options?: FieldOption[];
};

type Props = {
  spaceType: string;
  attributes: AttributeState;
  setAttributes: React.Dispatch<React.SetStateAction<AttributeState>>;
};

function getFieldIcon(key: string, label: string) {
  const normalized = `${key} ${label}`.toLowerCase();

  if (normalized.includes("indoor") || normalized.includes("outdoor")) {
    return IndoorOutdoorIcon;
  }
  if (normalized.includes("climate")) return Thermometer;
  if (normalized.includes("access")) return Key;
  if (normalized.includes("security")) return Shield;
  if (normalized.includes("vehicle")) return Car;
  if (normalized.includes("parking")) return Car;
  if (normalized.includes("alarm")) return AlarmSmoke;
  if (normalized.includes("cctv")) return Camera;
  if (normalized.includes("gate")) return Fence;
  if (normalized.includes("guard")) return UserCheck;
  if (normalized.includes("remote")) return Lock;
  if (normalized.includes("key")) return Key;
  if (normalized.includes("size")) return Ruler;
  if (normalized.includes("dimension")) return Ruler;
  if (normalized.includes("height")) return Ruler;
  if (normalized.includes("width")) return Ruler;
  if (normalized.includes("length")) return Ruler;
  if (normalized.includes("storage")) return Warehouse;
  if (normalized.includes("office")) return Building;
  if (normalized.includes("workspace")) return Building;
  if (normalized.includes("floor")) return Layers3;
  if (normalized.includes("unit")) return Square;
  if (normalized.includes("bay")) return Square;
  if (normalized.includes("door")) return DoorOpen;
  if (normalized.includes("location")) return MapPin;
  if (normalized.includes("price")) return CircleDollarSign;
  if (normalized.includes("availability")) return Clock3;
  if (normalized.includes("feature")) return Grid3X3;
  if (normalized.includes("condition")) return CheckSquare;
  if (normalized.includes("equipment")) return Wrench;
  if (normalized.includes("item")) return Package;
  if (normalized.includes("description")) return FileText;

  return CircleHelp;
}

function isIndoorOutdoorField(field: FieldConfig) {
  const label = field.label.toLowerCase();
  const key = field.key.toLowerCase();
  return (
    label.includes("indoor / outdoor") ||
    label.includes("indoor/outdoor") ||
    key.includes("indoor_outdoor") ||
    key.includes("indooroutdoor")
  );
}

function isClimateControlledField(field: FieldConfig) {
  const label = field.label.toLowerCase();
  const key = field.key.toLowerCase();
  return (
    label.includes("climate controlled") ||
    key.includes("climate_controlled") ||
    key.includes("climatecontrolled")
  );
}

function isLengthField(field: FieldConfig) {
  const label = field.label.toLowerCase();
  const key = field.key.toLowerCase();
  return label.includes("length") || key.includes("length");
}

function isWidthField(field: FieldConfig) {
  const label = field.label.toLowerCase();
  const key = field.key.toLowerCase();
  return label.includes("width") || key.includes("width");
}

function isHeightField(field: FieldConfig) {
  const label = field.label.toLowerCase();
  const key = field.key.toLowerCase();
  return label.includes("height") || key.includes("height");
}

export default function SpaceCategoryFields({
  spaceType,
  attributes,
  setAttributes,
}: Props) {
  const fields = (spaceFieldConfig[spaceType] || []) as FieldConfig[];

  function getSingleValue(key: string) {
    return attributes[key]?.[0] || "";
  }

  function updateSingleValue(key: string, value: string) {
    setAttributes((current) => ({
      ...current,
      [key]: value ? [value] : [],
    }));
  }

  function toggleMultiValue(key: string, value: string) {
    setAttributes((current) => {
      const existing = current[key] || [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];

      return {
        ...current,
        [key]: next,
      };
    });
  }

  function updateBooleanValue(key: string, value: string) {
    setAttributes((current) => ({
      ...current,
      [key]: value ? [value] : [],
    }));
  }

  function renderField(field: FieldConfig) {
    const Icon = getFieldIcon(field.key, field.label);

    return (
      <div
        key={field.key}
        className="rounded-md border border-gray-200 bg-[#f8fafb] p-4"
      >
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[#192a3a]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#192a3a] text-white">
            <Icon className="h-4 w-4" />
          </span>
          <span>{field.label}</span>
        </label>

        {field.type === "text" && (
          <input
            type="text"
            value={getSingleValue(field.key)}
            onChange={(e) => updateSingleValue(field.key, e.target.value)}
            placeholder={field.placeholder || ""}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#192a3a]"
          />
        )}

        {field.type === "number" && (
          <input
            type="number"
            value={getSingleValue(field.key)}
            onChange={(e) => updateSingleValue(field.key, e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#192a3a]"
          />
        )}

        {field.type === "select" && (
          <select
            value={getSingleValue(field.key)}
            onChange={(e) => updateSingleValue(field.key, e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#192a3a]"
          >
            <option value="">Select an option</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {field.type === "boolean" && (
          <div className="flex flex-wrap gap-2">
            {[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ].map((option) => {
              const selected = getSingleValue(field.key) === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateBooleanValue(field.key, option.value)}
                  className={`rounded-md border px-3 py-2 text-sm transition ${
                    selected
                      ? "border-[#192a3a] bg-[#192a3a] text-white"
                      : "border-gray-300 bg-white text-[#192a3a] hover:border-[#192a3a]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {field.type === "multiselect" && (
          <div className="flex flex-wrap gap-2">
            {field.options?.map((option) => {
              const selected = (attributes[field.key] || []).includes(
                option.value
              );

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleMultiValue(field.key, option.value)}
                  className={`rounded-md border px-3 py-2 text-sm leading-none transition ${
                    selected
                      ? "border-[#192a3a] bg-[#192a3a] text-white"
                      : "border-gray-300 bg-white text-[#192a3a] hover:border-[#192a3a]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (fields.length === 0) {
    return null;
  }

  const indoorOutdoorField = fields.find(isIndoorOutdoorField);
  const climateControlledField = fields.find(isClimateControlledField);

  const lengthField = fields.find(isLengthField);
  const widthField = fields.find(isWidthField);
  const heightField = fields.find(isHeightField);

  const groupedKeys = new Set<string>(
    [
      indoorOutdoorField?.key,
      climateControlledField?.key,
      lengthField?.key,
      widthField?.key,
      heightField?.key,
    ].filter(Boolean) as string[]
  );

  const remainingFields = fields.filter((field) => !groupedKeys.has(field.key));

  return (
    <div className="space-y-4 rounded-md border border-gray-300 bg-white p-5 shadow-sm">
      <div className="border-b border-gray-200 pb-3">
        <h3 className="text-lg font-semibold text-[#192a3a]">
          Category-specific details
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Add the details that help renters understand this type of space.
        </p>
      </div>

      {(indoorOutdoorField || climateControlledField) && (
        <div className="grid gap-4 md:grid-cols-2">
          {indoorOutdoorField && renderField(indoorOutdoorField)}
          {climateControlledField && renderField(climateControlledField)}
        </div>
      )}

      {(lengthField || widthField || heightField) && (
        <div className="grid gap-4 md:grid-cols-3">
          {lengthField && renderField(lengthField)}
          {widthField && renderField(widthField)}
          {heightField && renderField(heightField)}
        </div>
      )}

      {remainingFields.map((field) => renderField(field))}
    </div>
  );
}