"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  BOOKING_REQUIREMENT_TEMPLATE_GROUPS,
  createFieldDraftFromTemplate,
  isTemplateAlreadyAdded,
  type BookingRequirementTemplate,
} from "@/lib/booking-requirement-templates";
import type { SpaceBookingRequirementFieldDraft } from "@/lib/space-booking-requirement-fields";

type Props = {
  fields: SpaceBookingRequirementFieldDraft[];
  onChange: (fields: SpaceBookingRequirementFieldDraft[]) => void;
  disabled?: boolean;
};

export function SpaceBookingRequirementsWizardSection({
  fields,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(fields.length > 0);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

  function addTemplate(template: BookingRequirementTemplate) {
    if (disabled) return;
    setOpen(true);
    setTemplateMessage(null);

    if (isTemplateAlreadyAdded(fields, template)) {
      setTemplateMessage("This requirement is already added.");
      return;
    }

    onChange([...fields, createFieldDraftFromTemplate(template, fields.length)]);
  }

  function removeField(key: string) {
    onChange(fields.filter((field) => (field._localKey || field.id) !== key));
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-2xl border border-[#e2e8f0] bg-white shadow-sm"
    >
      <summary className="cursor-pointer list-none px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#192a3a]">
              Booking requirements
              <span className="ml-2 text-xs font-normal text-gray-500">(optional)</span>
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 sm:text-sm">
              Ask renters standard questions or request documents before they can request this
              space. You can refine these later in listing settings.
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-gray-500" aria-hidden>
            {open ? "−" : "+"}
          </span>
        </div>
      </summary>

      <div className="space-y-4 border-t border-[#eef2f6] px-4 pb-4 pt-3 sm:px-5">
        {fields.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {fields.map((field) => {
              const key = field._localKey || field.id || field.label;
              return (
                <li
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full border border-[#e2e8f0] bg-[#f8fafb] py-1 pl-3 pr-1 text-xs font-medium text-[#192a3a]"
                >
                  {field.label}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeField(key)}
                    className="rounded-full p-1 text-gray-500 hover:bg-white hover:text-red-700 disabled:opacity-50"
                    aria-label={`Remove ${field.label}`}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-gray-500">No requirements selected yet.</p>
        )}

        <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafb] p-4">
          <h4 className="text-sm font-semibold text-[#192a3a]">Choose common requirements</h4>
          <p className="mt-1 text-xs text-gray-600">
            Quickly add standard questions or document requests renters must complete before
            requesting this space.
          </p>
          <div className="mt-4 space-y-4">
            {BOOKING_REQUIREMENT_TEMPLATE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {group.title}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.templates.map((template) => {
                    const alreadyAdded = isTemplateAlreadyAdded(fields, template);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        disabled={disabled || alreadyAdded}
                        onClick={() => addTemplate(template)}
                        className="rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#192a3a] hover:bg-white disabled:cursor-default disabled:opacity-50"
                        title={
                          alreadyAdded ? "Already added" : `Add "${template.label}"`
                        }
                      >
                        {template.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {templateMessage ? (
            <p className="mt-3 text-xs text-amber-800">{templateMessage}</p>
          ) : null}
        </div>
      </div>
    </details>
  );
}
