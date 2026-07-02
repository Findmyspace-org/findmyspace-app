"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  UnsavedSectionIndicator,
  useRegisterUnsavedSection,
  useUnsavedChangesOptional,
} from "@/app/components/UnsavedChangesProvider";
import {
  createEmptyFieldDraft,
  fieldTypeNeedsOptions,
  normalizeSpaceBookingFieldRow,
  SPACE_BOOKING_FIELD_TYPE_LABELS,
  SPACE_BOOKING_FIELD_TYPES,
  sortBookingFields,
  type SpaceBookingFieldType,
  type SpaceBookingRequirementFieldDraft,
} from "@/lib/space-booking-requirement-fields";
import {
  BOOKING_REQUIREMENT_TEMPLATE_GROUPS,
  createFieldDraftFromTemplate,
  isTemplateAlreadyAdded,
  type BookingRequirementTemplate,
} from "@/lib/booking-requirement-templates";
import {
  getRequirementDefinitionFieldErrors,
  hasRequirementDefinitionFieldErrors,
  OWNER_DEFINITION_BLOCK_MESSAGE,
  type RequirementDefinitionFieldErrors,
  validateNoContactInfoInRequirementDefinition,
} from "@/lib/contact-info-guard";

const FIELD_CLASS =
  "w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#192a3a]/20";

const FIELD_ERROR_CLASS =
  "border-red-300 bg-red-50/80 focus:border-red-400 focus:ring-red-200/50";

function fieldInputClass(hasError: boolean) {
  return `${FIELD_CLASS}${hasError ? ` ${FIELD_ERROR_CLASS}` : ""}`;
}

function FieldInlineError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

type Props = {
  spaceId: string;
  disabled?: boolean;
};

function serializeFieldsForDirtyCheck(fields: SpaceBookingRequirementFieldDraft[]): string {
  return JSON.stringify(
    sortBookingFields(fields).map((field) => ({
      id: field.id || "",
      _localKey: field._localKey || "",
      label: field.label.trim(),
      help_text: field.help_text?.trim() || null,
      field_type: field.field_type,
      required: field.required,
      options: field.options,
      sort_order: field.sort_order,
      active: field.active,
    }))
  );
}

export function SpaceBookingRequirementsSection({ spaceId, disabled = false }: Props) {
  const unsavedCtx = useUnsavedChangesOptional();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<SpaceBookingRequirementFieldDraft[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [showContactErrors, setShowContactErrors] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);

  const activeFields = useMemo(
    () => sortBookingFields(fields.filter((field) => field.active)),
    [fields]
  );

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await (supabase.from("space_booking_requirement_fields" as never) as any)
      .select(
        "id, space_id, label, help_text, field_type, required, options, sort_order, active"
      )
      .eq("space_id", spaceId)
      .order("sort_order", { ascending: true });

    if (error) {
      setMessage(error.message);
      setFields([]);
    } else {
      const rows = ((data || []) as Record<string, unknown>[]).map(normalizeSpaceBookingFieldRow);
      setFields(rows);
      setSavedSnapshot(serializeFieldsForDirtyCheck(rows));
      unsavedCtx?.markSectionsClean(["booking-requirements"]);
      if (rows.some((row) => row.active)) setOpen(true);
    }
    setLoading(false);
  }, [spaceId, unsavedCtx]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchField(idOrKey: string, patch: Partial<SpaceBookingRequirementFieldDraft>) {
    setFields((current) =>
      current.map((field) => {
        const key = field.id || field._localKey;
        if (key !== idOrKey) return field;
        const next = { ...field, ...patch };
        if (patch.field_type && fieldTypeNeedsOptions(patch.field_type)) {
          next.options = field.options?.length ? field.options : [""];
        }
        if (patch.field_type && !fieldTypeNeedsOptions(patch.field_type)) {
          next.options = null;
        }
        return next;
      })
    );
  }

  function addField(fieldType: SpaceBookingFieldType = "short_text") {
    setOpen(true);
    setTemplateMessage(null);
    setFields((current) => [
      ...current,
      createEmptyFieldDraft(current.length, fieldType),
    ]);
  }

  function addTemplate(template: BookingRequirementTemplate) {
    if (disabled) return;
    setOpen(true);
    setTemplateMessage(null);

    if (isTemplateAlreadyAdded(fields, template)) {
      setTemplateMessage("This requirement is already added.");
      return;
    }

    setFields((current) => [
      ...current,
      createFieldDraftFromTemplate(template, current.length),
    ]);
  }

  function moveField(idOrKey: string, direction: -1 | 1) {
    setFields((current) => {
      const sorted = sortBookingFields(
        current.map((field, index) => ({ ...field, sort_order: index }))
      );
      const index = sorted.findIndex((field) => (field.id || field._localKey) === idOrKey);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sorted.length) return current;
      const next = [...sorted];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next.map((field, order) => ({ ...field, sort_order: order }));
    });
  }

  const contactErrorsByFieldKey = useMemo(() => {
    const map: Record<string, RequirementDefinitionFieldErrors> = {};
    for (const field of activeFields) {
      const fieldKey = field.id || field._localKey;
      if (!fieldKey) continue;
      const errors = getRequirementDefinitionFieldErrors({
        label: field.label.trim(),
        help_text: field.help_text,
        field_type: field.field_type,
        options: fieldTypeNeedsOptions(field.field_type)
          ? (field.options || []).map((opt) => opt.trim()).filter(Boolean)
          : field.options,
      });
      if (hasRequirementDefinitionFieldErrors(errors)) {
        map[fieldKey] = errors;
      }
    }
    return map;
  }, [activeFields]);

  const isDirty =
    !loading && !disabled && Boolean(spaceId) && serializeFieldsForDirtyCheck(fields) !== savedSnapshot;

  const saveFields = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    try {
      const normalized = fields.map((field, index) => ({
        ...field,
        sort_order: index,
        label: field.label.trim(),
        options: fieldTypeNeedsOptions(field.field_type)
          ? (field.options || []).map((opt) => opt.trim()).filter(Boolean)
          : null,
      }));

      for (const field of normalized.filter((item) => item.active)) {
        if (!field.label) {
          setMessage("Each question needs a label.");
          return false;
        }
        if (
          fieldTypeNeedsOptions(field.field_type) &&
          (!field.options || field.options.length === 0)
        ) {
          setMessage(`"${field.label}" needs at least one option.`);
          return false;
        }

        const contactCheck = validateNoContactInfoInRequirementDefinition({
          label: field.label,
          help_text: field.help_text,
          field_type: field.field_type,
          options: field.options,
        });
        if (!contactCheck.ok) {
          setShowContactErrors(true);
          setMessage(contactCheck.error);
          return false;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please sign in again to save booking requirements.");
        return false;
      }

      const res = await fetch(`/api/spaces/${spaceId}/booking-requirement-fields`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: normalized.map((field) => ({
            id: field.id || undefined,
            label: field.label,
            help_text: field.help_text,
            field_type: field.field_type,
            required: field.required,
            options: field.options,
            sort_order: field.sort_order,
            active: field.active,
          })),
        }),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(json?.error || OWNER_DEFINITION_BLOCK_MESSAGE);
      }

      await load();
      setShowContactErrors(false);
      setMessage("Booking requirements saved.");
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save requirements.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [fields, load, spaceId]);

  useRegisterUnsavedSection("booking-requirements", {
    label: "Booking requirements",
    isDirty,
    save: disabled || !spaceId ? undefined : saveFields,
  });

  async function disableField(idOrKey: string) {
    const field = fields.find((item) => (item.id || item._localKey) === idOrKey);
    if (!field) return;
    if (!field.id) {
      setFields((current) =>
        current.filter((item) => (item.id || item._localKey) !== idOrKey)
      );
      return;
    }
    patchField(idOrKey, { active: false });
  }

  return (
    <section className="rounded-xl border border-[#e2e8f0] bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:px-5"
      >
        <div>
          <h2 className="text-base font-semibold text-[#192a3a]">
            Booking requirements
            <UnsavedSectionIndicator show={isDirty} />
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Ask renters for extra information before they request this space. Contact details
            (email, phone, address, ID) cannot be requested here — FindMySpace shares those at
            the approved booking stage.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Choose common requirements or add custom questions and document requests. All
            requirements save to one list used on the booking form.
          </p>
        </div>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-gray-500 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-[#eef2f6] px-4 pb-5 pt-4 sm:px-5">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </p>
          ) : activeFields.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#e2e8f0] bg-[#f8fafb] px-4 py-6 text-center text-sm text-gray-600">
              No extra booking requirements added. Renters can request this space using the
              standard booking form.
            </p>
          ) : (
            <div className="space-y-3">
              {activeFields.map((field) => {
                const key = field.id || field._localKey || field.label;
                const contactErrors = showContactErrors ? contactErrorsByFieldKey[key] : undefined;
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-[#e2e8f0] bg-[#fbfcfd] p-4"
                  >
                    <div className="mb-3 flex items-start gap-2">
                      <GripVertical className="mt-2 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Question label
                            </label>
                            <input
                              type="text"
                              value={field.label}
                              disabled={disabled}
                              onChange={(e) => patchField(key, { label: e.target.value })}
                              className={fieldInputClass(Boolean(contactErrors?.label))}
                              aria-invalid={contactErrors?.label ? true : undefined}
                            />
                            <FieldInlineError message={contactErrors?.label} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Field type
                            </label>
                            <select
                              value={field.field_type}
                              disabled={disabled}
                              onChange={(e) =>
                                patchField(key, {
                                  field_type: e.target.value as SpaceBookingFieldType,
                                })
                              }
                              className={FIELD_CLASS}
                            >
                              {SPACE_BOOKING_FIELD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {SPACE_BOOKING_FIELD_TYPE_LABELS[type]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-700">
                            Help text (optional)
                          </label>
                          <input
                            type="text"
                            value={field.help_text || ""}
                            disabled={disabled}
                            onChange={(e) => patchField(key, { help_text: e.target.value })}
                            className={fieldInputClass(Boolean(contactErrors?.help_text))}
                            aria-invalid={contactErrors?.help_text ? true : undefined}
                          />
                          <FieldInlineError message={contactErrors?.help_text} />
                        </div>

                        {fieldTypeNeedsOptions(field.field_type) ? (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-700">
                              Options
                            </label>
                            <div className="space-y-2">
                              {(field.options || [""]).map((option, optionIndex) => (
                                <div key={`${key}-opt-${optionIndex}`} className="flex gap-2">
                                  <div className="min-w-0 flex-1">
                                    <input
                                      type="text"
                                      value={option}
                                      disabled={disabled}
                                      onChange={(e) => {
                                        const next = [...(field.options || [""])];
                                        next[optionIndex] = e.target.value;
                                        patchField(key, { options: next });
                                      }}
                                      className={fieldInputClass(
                                        Boolean(contactErrors?.options?.[optionIndex])
                                      )}
                                      aria-invalid={
                                        contactErrors?.options?.[optionIndex] ? true : undefined
                                      }
                                    />
                                    <FieldInlineError
                                      message={contactErrors?.options?.[optionIndex]}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => {
                                      const next = [...(field.options || [""])];
                                      next.splice(optionIndex, 1);
                                      patchField(key, { options: next.length ? next : [""] });
                                    }}
                                    className="mt-0.5 shrink-0 self-start rounded-lg border border-gray-300 px-2 text-gray-600 hover:bg-gray-50"
                                    aria-label="Remove option"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() =>
                                  patchField(key, {
                                    options: [...(field.options || [""]), ""],
                                  })
                                }
                                className="text-xs font-medium text-[#192a3a] hover:underline"
                              >
                                Add option
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={field.required}
                            disabled={disabled}
                            onChange={(e) => patchField(key, { required: e.target.checked })}
                          />
                          Required
                        </label>
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => moveField(key, -1)}
                          className="rounded border border-gray-300 p-1 text-gray-600 hover:bg-white"
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => moveField(key, 1)}
                          className="rounded border border-gray-300 p-1 text-gray-600 hover:bg-white"
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => void disableField(key)}
                          className="rounded border border-red-200 p-1 text-red-600 hover:bg-red-50"
                          aria-label="Remove question"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading ? (
            <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafb] p-4">
              <h3 className="text-sm font-semibold text-[#192a3a]">Choose common requirements</h3>
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
                            disabled={disabled || saving || alreadyAdded}
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
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => addField("short_text")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#192a3a] hover:bg-[#f8fafb]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add custom question
            </button>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => addField("file_upload")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-medium text-[#192a3a] hover:bg-[#f8fafb]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Request a document
            </button>
          </div>

          {!disabled ? (
            <button
              type="button"
              onClick={() => void saveFields()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#192a3a] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save booking requirements
            </button>
          ) : null}

          {message ? (
            <p
              className={
                showContactErrors
                  ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  : "text-sm text-gray-600"
              }
            >
              {message}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="border-t border-[#eef2f6] px-4 pb-4 pt-2 sm:px-5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-[#192a3a] hover:underline"
          >
            Add booking requirements
          </button>
        </div>
      )}
    </section>
  );
}
