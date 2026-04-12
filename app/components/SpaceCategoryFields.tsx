"use client";

import {
  getSpaceFeatureLayout,
  SPACE_TYPE_LABELS,
  normalizeSpaceTypeForFeatures,
  type SpaceFeatureField,
} from "@/app/data/spaceFeatureConfig";
import { SpaceFeatureIcon } from "@/app/components/space-feature-icons";

type AttributeState = Record<string, string[]>;

type Props = {
  spaceType: string;
  attributes: AttributeState;
  setAttributes: React.Dispatch<React.SetStateAction<AttributeState>>;
};

export default function SpaceCategoryFields({
  spaceType,
  attributes,
  setAttributes,
}: Props) {
  const layout = getSpaceFeatureLayout(spaceType);
  const normalized = normalizeSpaceTypeForFeatures(spaceType);

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

  function toggleCheckbox(key: string, checked: boolean) {
    setAttributes((current) => ({
      ...current,
      [key]: checked ? ["yes"] : [],
    }));
  }

  function isCheckboxChecked(key: string) {
    return (attributes[key] || []).includes("yes");
  }

  function renderField(field: SpaceFeatureField) {
    if (field.kind === "checkbox") {
      const checked = isCheckboxChecked(field.key);
      return (
        <label
          key={field.key}
          className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-1 py-1 text-sm text-[#192a3a] transition hover:border-gray-200 hover:bg-white"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => toggleCheckbox(field.key, e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-[#192a3a] focus:ring-[#192a3a]"
          />
          <SpaceFeatureIcon name={field.icon} className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
          <span className="leading-snug">{field.label}</span>
        </label>
      );
    }

    if (field.kind === "radio") {
      return (
        <div key={field.key} className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            <SpaceFeatureIcon name={field.icon} className="h-4 w-4 text-gray-500" />
            {field.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((opt) => {
              const selected = getSingleValue(field.key) === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                    selected
                      ? "border-[#192a3a] bg-[#192a3a] text-white"
                      : "border-gray-200 bg-white text-[#192a3a] hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name={field.key}
                    value={opt.value}
                    checked={selected}
                    onChange={() => updateSingleValue(field.key, opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    if (field.kind === "multiselect") {
      const selected = attributes[field.key] || [];
      return (
        <div key={field.key} className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            <SpaceFeatureIcon name={field.icon} className="h-4 w-4 text-gray-500" />
            {field.label}
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {field.options.map((opt) => {
              const on = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1.5 text-xs text-[#192a3a] hover:border-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMultiValue(field.key, opt.value)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-[#192a3a]"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  }

  if (layout.sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm md:p-5">
      <div className="border-b border-gray-100 pb-3">
        <h3 className="text-base font-semibold text-[#192a3a]">Features &amp; amenities</h3>
        <p className="mt-0.5 text-xs text-gray-600">
          Select what applies — tailored for{" "}
          {SPACE_TYPE_LABELS[normalized] || spaceType}.
        </p>
      </div>

      <div className="space-y-4">
        {layout.sections.map((section) => {
          const checkboxes = section.fields.filter((f) => f.kind === "checkbox");
          const others = section.fields.filter((f) => f.kind !== "checkbox");

          return (
            <div
              key={section.id}
              className="rounded-md border border-gray-100 bg-[#f8fafb] p-3 md:p-4"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                {section.title}
              </p>
              <div className="space-y-4">
                {checkboxes.length > 0 && (
                  <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {checkboxes.map((field) => renderField(field))}
                  </div>
                )}
                {others.map((field) => (
                  <div key={field.key}>{renderField(field)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
