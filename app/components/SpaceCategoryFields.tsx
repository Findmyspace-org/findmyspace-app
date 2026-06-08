"use client";

import {
  getSpaceFeatureLayout,
  SPACE_TYPE_LABELS,
  normalizeSpaceTypeForFeatures,
  normalizeFeatureAttributes,
  toCanonicalFeatureKey,
  getFeatureAliasKeys,
  type SpaceFeatureField,
  type SpaceFeatureSection,
} from "@/app/data/spaceFeatureConfig";
import { SpaceFeatureIcon } from "@/app/components/space-feature-icons";

type AttributeState = Record<string, string[]>;

type Props = {
  spaceType: string;
  attributes: AttributeState;
  setAttributes: React.Dispatch<React.SetStateAction<AttributeState>>;
  /** Omit outer card — use inside a parent host layout (e.g. unified listing step). */
  embedded?: boolean;
};

export default function SpaceCategoryFields({
  spaceType,
  attributes,
  setAttributes,
  embedded = false,
}: Props) {
  const layout = getSpaceFeatureLayout(spaceType);
  const normalized = normalizeSpaceTypeForFeatures(spaceType);
  const normalizedAttributes = normalizeFeatureAttributes(attributes);

  function setCanonicalValue(canonicalKey: string, values: string[]) {
    setAttributes((current) => {
      const next: AttributeState = { ...current, [canonicalKey]: values };
      for (const aliasKey of getFeatureAliasKeys(canonicalKey)) {
        delete next[aliasKey];
      }
      return next;
    });
  }

  function getSingleValue(key: string) {
    const canonicalKey = toCanonicalFeatureKey(key);
    return normalizedAttributes[canonicalKey]?.[0] || "";
  }

  function updateSingleValue(key: string, value: string) {
    const canonicalKey = toCanonicalFeatureKey(key);
    setCanonicalValue(canonicalKey, value ? [value] : []);
  }

  function toggleMultiValue(key: string, value: string) {
    const canonicalKey = toCanonicalFeatureKey(key);
    setAttributes((current) => {
      const normalizedCurrent = normalizeFeatureAttributes(current);
      const existing = normalizedCurrent[canonicalKey] || [];
      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];
      const withUpdate: AttributeState = { ...current, [canonicalKey]: next };
      for (const aliasKey of getFeatureAliasKeys(canonicalKey)) {
        delete withUpdate[aliasKey];
      }
      return withUpdate;
    });
  }

  function toggleCheckbox(key: string, checked: boolean) {
    const canonicalKey = toCanonicalFeatureKey(key);
    setCanonicalValue(canonicalKey, checked ? ["yes"] : []);
  }

  function isCheckboxChecked(key: string) {
    const canonicalKey = toCanonicalFeatureKey(key);
    return (normalizedAttributes[canonicalKey] || []).includes("yes");
  }

  function renderField(field: SpaceFeatureField) {
    if (field.kind === "checkbox") {
      const checked = isCheckboxChecked(field.key);
      return (
        <label
          key={field.key}
          className="flex cursor-pointer items-start gap-2 rounded-xl border border-transparent px-2 py-1.5 text-sm text-[#192a3a] transition hover:border-[#e2e8f0] hover:bg-white"
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => toggleCheckbox(field.key, e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d4dbe2] text-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
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
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    selected
                      ? "border-[#c1121f] bg-[#c1121f] text-white shadow-[0_1px_2px_rgba(15,23,42,0.1)]"
                      : "border-[#d7dde3] bg-white text-[#334155] hover:-translate-y-0.5 hover:border-[#b8c2cc] hover:shadow-sm"
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
      const selected =
        normalizedAttributes[toCanonicalFeatureKey(field.key)] || [];
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
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e8edf2] bg-white px-3 py-2 text-xs font-medium text-[#334155] transition hover:border-[#d4dbe2] hover:shadow-sm"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMultiValue(field.key, opt.value)}
                    className="h-3.5 w-3.5 rounded border-[#d4dbe2] text-[#c1121f] focus:ring-2 focus:ring-[#c1121f]/20"
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

  function renderCheckboxGrid(fields: SpaceFeatureField[]) {
    const checkboxes = fields.filter((f) => f.kind === "checkbox");
    if (checkboxes.length === 0) return null;

    return (
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {checkboxes.map((field) => renderField(field))}
      </div>
    );
  }

  function renderSection(section: SpaceFeatureSection) {
    const others = section.fields.filter((f) => f.kind !== "checkbox");
    const topCheckboxes = section.fields.filter((f) => f.kind === "checkbox");
    const hasSubsections = (section.subsections?.length ?? 0) > 0;

    return (
      <div
        key={section.id}
        className="rounded-xl border border-[#e8edf2] bg-[#f8fafc] p-3 md:p-4"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">
          {section.title}
        </p>
        <div className="space-y-4">
          {topCheckboxes.length > 0 && renderCheckboxGrid(topCheckboxes)}
          {hasSubsections
            ? section.subsections!.map((sub) => (
                <div key={sub.id} className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                    {sub.title}
                  </p>
                  {renderCheckboxGrid(sub.fields)}
                </div>
              ))
            : null}
          {others.map((field) => (
            <div key={field.key}>{renderField(field)}</div>
          ))}
        </div>
      </div>
    );
  }

  if (layout.sections.length === 0) {
    return null;
  }

  const body = (
    <>
      <div
        className={
          embedded
            ? "border-b border-[#e5e7eb] pb-5"
            : "border-b border-[#e5e7eb] pb-4"
        }
      >
        <h3 className="text-base font-semibold text-[#0f172a]">Features &amp; amenities</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[#64748b]">
          Select what applies — tailored for{" "}
          {SPACE_TYPE_LABELS[normalized] || spaceType}.
        </p>
      </div>

      <div className="space-y-4">
        {layout.sections.map((section) => renderSection(section))}
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] sm:p-5">
      {body}
    </div>
  );
}
