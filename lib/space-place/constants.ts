export const PIPELINE_STAGES = [
  "prospect",
  "first_contact",
  "follow_up",
  "in_progress",
  "signed_up",
  "listed",
  "closed_lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: "Prospect",
  first_contact: "First Contact",
  follow_up: "Follow-up",
  in_progress: "In Progress",
  signed_up: "Signed Up",
  listed: "Listed",
  closed_lost: "Closed / Not Now",
};

export const ENGAGEMENT_TYPES = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "note", label: "Note" },
] as const;

export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;

export const ORGANISATION_STATUSES = [
  "new",
  "active",
  "inactive",
  "archived",
] as const;

export const CONTACT_STATUSES = ["active", "inactive", "lead"] as const;

export const BRAND_RED = "#c1121f";
