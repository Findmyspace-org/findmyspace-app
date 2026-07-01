import {
  validateNoContactInfoInRequirementDefinition,
} from "@/lib/contact-info-guard";
import {
  createEmptyFieldDraft,
  fieldTypeNeedsOptions,
  type SpaceBookingFieldType,
  type SpaceBookingRequirementFieldDraft,
} from "@/lib/space-booking-requirement-fields";

export type BookingRequirementTemplate = {
  id: string;
  label: string;
  field_type: SpaceBookingFieldType;
  required: boolean;
  help_text?: string | null;
  options?: string[] | null;
};

export type BookingRequirementTemplateGroup = {
  title: string;
  templates: BookingRequirementTemplate[];
};

export const BOOKING_REQUIREMENT_TEMPLATE_GROUPS: BookingRequirementTemplateGroup[] = [
  {
    title: "Event details",
    templates: [
      {
        id: "type_of_event",
        label: "Type of event",
        field_type: "dropdown",
        required: true,
        help_text: "What kind of event are you planning?",
        options: [
          "Wedding",
          "Corporate",
          "Community",
          "Private party",
          "Conference",
          "Other",
        ],
      },
      {
        id: "number_of_guests",
        label: "Number of guests",
        field_type: "number",
        required: true,
        help_text: "Approximate number of guests attending.",
      },
      {
        id: "organisation_name",
        label: "Organisation / club / company name",
        field_type: "short_text",
        required: false,
        help_text: "Name of the organising group only (e.g. club or society).",
      },
    ],
  },
  {
    title: "Setup needs",
    templates: [
      {
        id: "chairs_required",
        label: "Chairs required",
        field_type: "yes_no",
        required: false,
      },
      {
        id: "number_of_chairs",
        label: "Number of chairs",
        field_type: "number",
        required: false,
        help_text: "How many chairs do you need?",
      },
      {
        id: "tables_required",
        label: "Tables required",
        field_type: "yes_no",
        required: false,
      },
      {
        id: "number_of_tables",
        label: "Number of tables",
        field_type: "number",
        required: false,
        help_text: "How many tables do you need?",
      },
      {
        id: "projector_required",
        label: "Projector required",
        field_type: "yes_no",
        required: false,
      },
      {
        id: "sound_required",
        label: "Sound / microphone required",
        field_type: "yes_no",
        required: false,
      },
      {
        id: "cleaning_required",
        label: "Cleaning required",
        field_type: "yes_no",
        required: false,
      },
      {
        id: "changing_rooms_required",
        label: "Changing rooms required",
        field_type: "yes_no",
        required: false,
      },
      {
        id: "security_required",
        label: "Security required",
        field_type: "yes_no",
        required: false,
      },
    ],
  },
  {
    title: "Documents",
    templates: [
      {
        id: "event_plan",
        label: "Event plan",
        field_type: "file_upload",
        required: false,
        help_text: "Upload your event plan or run sheet (PDF or image).",
      },
      {
        id: "health_safety_approval",
        label: "Health and safety approval",
        field_type: "file_upload",
        required: false,
      },
      {
        id: "public_liability_insurance",
        label: "Public liability insurance",
        field_type: "file_upload",
        required: false,
      },
      {
        id: "municipal_event_permit",
        label: "Municipal/event permit",
        field_type: "file_upload",
        required: false,
      },
      {
        id: "police_approval",
        label: "Police/SAPS approval",
        field_type: "file_upload",
        required: false,
      },
    ],
  },
  {
    title: "Storage",
    templates: [
      {
        id: "what_will_you_store",
        label: "What will you store?",
        field_type: "long_text",
        required: true,
        help_text: "Describe the items you plan to store.",
      },
      {
        id: "estimated_number_of_items",
        label: "Estimated number of items",
        field_type: "number",
        required: false,
      },
      {
        id: "access_during_rental",
        label: "Access required during rental period",
        field_type: "yes_no",
        required: false,
      },
    ],
  },
  {
    title: "Parking",
    templates: [
      {
        id: "vehicle_type",
        label: "Vehicle type",
        field_type: "short_text",
        required: false,
        help_text: "e.g. Sedan, SUV, van, motorcycle.",
      },
      {
        id: "access_frequency",
        label: "Access frequency",
        field_type: "dropdown",
        required: false,
        options: ["Daily", "Weekly", "Occasionally", "One-off"],
      },
    ],
  },
];

export const BOOKING_REQUIREMENT_TEMPLATES: BookingRequirementTemplate[] =
  BOOKING_REQUIREMENT_TEMPLATE_GROUPS.flatMap((group) => group.templates);

export function normalizeRequirementLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isTemplateAlreadyAdded(
  fields: SpaceBookingRequirementFieldDraft[],
  template: BookingRequirementTemplate
): boolean {
  const normalized = normalizeRequirementLabel(template.label);
  return fields.some(
    (field) =>
      field.active &&
      (field._templateId === template.id ||
        normalizeRequirementLabel(field.label) === normalized)
  );
}

export function createFieldDraftFromTemplate(
  template: BookingRequirementTemplate,
  sortOrder: number
): SpaceBookingRequirementFieldDraft {
  const draft = createEmptyFieldDraft(sortOrder, template.field_type);
  return {
    ...draft,
    _templateId: template.id,
    label: template.label,
    help_text: template.help_text ?? null,
    required: template.required,
    options: fieldTypeNeedsOptions(template.field_type)
      ? template.options?.length
        ? [...template.options]
        : [""]
      : null,
  };
}

function assertTemplatesPassContactGuard() {
  for (const template of BOOKING_REQUIREMENT_TEMPLATES) {
    const result = validateNoContactInfoInRequirementDefinition({
      label: template.label,
      help_text: template.help_text,
      field_type: template.field_type,
      options: template.options,
    });
    if (!result.ok) {
      throw new Error(
        `Booking requirement template "${template.id}" failed contact guard: ${result.error}`
      );
    }
  }
}

assertTemplatesPassContactGuard();
