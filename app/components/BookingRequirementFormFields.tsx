"use client";

import {
  type CustomFieldAnswerValue,
  type SpaceBookingRequirementField,
} from "@/lib/space-booking-requirement-fields";
import { FILE_UPLOAD_RENTER_HELPER_TEXT } from "@/lib/contact-info-guard";

const INPUT_CLASS =
  "w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20";

type Props = {
  fields: SpaceBookingRequirementField[];
  answers: Record<string, CustomFieldAnswerValue>;
  files: Record<string, File | null>;
  disabled?: boolean;
  onAnswerChange: (fieldId: string, value: CustomFieldAnswerValue) => void;
  onFileChange: (fieldId: string, file: File | null) => void;
};

export function BookingRequirementFormFields({
  fields,
  answers,
  files,
  disabled = false,
  onAnswerChange,
  onFileChange,
}: Props) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.03] sm:p-5">
      <div>
        <h3 className="text-base font-semibold text-[#192a3a]">
          Information required by the owner
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          Please complete the information below before submitting your booking request.
        </p>
      </div>

      {fields.map((field) => (
        <div key={field.id}>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            {field.label}
            {field.required ? <span className="text-red-600"> *</span> : null}
          </label>
          {field.help_text ? (
            <p className="mb-2 text-xs text-gray-500">{field.help_text}</p>
          ) : null}

          {field.field_type === "short_text" ? (
            <input
              type="text"
              value={String(answers[field.id] ?? "")}
              disabled={disabled}
              onChange={(e) => onAnswerChange(field.id, e.target.value)}
              className={INPUT_CLASS}
            />
          ) : null}

          {field.field_type === "long_text" ? (
            <textarea
              value={String(answers[field.id] ?? "")}
              disabled={disabled}
              rows={4}
              onChange={(e) => onAnswerChange(field.id, e.target.value)}
              className={INPUT_CLASS}
            />
          ) : null}

          {field.field_type === "number" ? (
            <input
              type="number"
              value={answers[field.id] === null || answers[field.id] === undefined ? "" : String(answers[field.id])}
              disabled={disabled}
              onChange={(e) => {
                const raw = e.target.value;
                onAnswerChange(field.id, raw === "" ? null : Number(raw));
              }}
              className={INPUT_CLASS}
            />
          ) : null}

          {field.field_type === "yes_no" ? (
            <div className="flex gap-2">
              {[
                { label: "Yes", value: true },
                { label: "No", value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => onAnswerChange(field.id, opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    answers[field.id] === opt.value
                      ? "bg-[#192a3a] text-white"
                      : "border border-[#e2e8f0] bg-white text-[#192a3a] hover:bg-[#f8fafb]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}

          {field.field_type === "dropdown" ? (
            <select
              value={String(answers[field.id] ?? "")}
              disabled={disabled}
              onChange={(e) => onAnswerChange(field.id, e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Select…</option>
              {(field.options || []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : null}

          {field.field_type === "multi_select" ? (
            <div className="flex flex-wrap gap-2">
              {(field.options || []).map((option) => {
                const selected = Array.isArray(answers[field.id])
                  ? (answers[field.id] as string[]).includes(option)
                  : false;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const current = Array.isArray(answers[field.id])
                        ? [...(answers[field.id] as string[])]
                        : [];
                      const next = selected
                        ? current.filter((item) => item !== option)
                        : [...current, option];
                      onAnswerChange(field.id, next);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? "bg-[#192a3a] text-white"
                        : "border border-[#e2e8f0] bg-white text-[#192a3a] hover:bg-[#f8fafb]"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : null}

          {field.field_type === "file_upload" ? (
            <div>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx"
                disabled={disabled}
                onChange={(e) => onFileChange(field.id, e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600"
              />
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                {FILE_UPLOAD_RENTER_HELPER_TEXT}
              </p>
              {files[field.id] ? (
                <p className="mt-1 text-xs text-gray-500">Selected: {files[field.id]?.name}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
