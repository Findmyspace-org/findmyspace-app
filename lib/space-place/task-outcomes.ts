import type { PipelineStage } from "./constants";

export const TASK_OUTCOME_OPTIONS = [
  { value: "no_answer", label: "No answer" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "whatsapp_sent", label: "WhatsApp sent" },
  { value: "email_sent", label: "Email sent" },
  { value: "info_deck_sent", label: "Info deck sent" },
  { value: "interested", label: "Interested" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "not_interested", label: "Not interested" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "waiting_for_client", label: "Waiting for client" },
  { value: "listing_information_requested", label: "Listing information requested" },
  { value: "listing_information_received", label: "Listing information received" },
  { value: "photos_requested", label: "Photos requested" },
  { value: "photos_received", label: "Photos received" },
  { value: "verification_pending", label: "Verification pending" },
  { value: "signed_up", label: "Signed up" },
  { value: "listed", label: "Listed" },
  { value: "other", label: "Other" },
] as const;

export const DEFAULT_TASK_OUTCOME = "needs_follow_up";

/** Suggested pipeline stage when completing a task (UI hint only unless applied on save). */
export const OUTCOME_PIPELINE_SUGGESTIONS: Partial<
  Record<(typeof TASK_OUTCOME_OPTIONS)[number]["value"], PipelineStage | null>
> = {
  no_answer: null,
  left_voicemail: null,
  whatsapp_sent: null,
  email_sent: null,
  info_deck_sent: null,
  interested: "in_progress",
  meeting_booked: "in_progress",
  not_interested: "closed_lost",
  needs_follow_up: "follow_up",
  waiting_for_client: "follow_up",
  listing_information_requested: "follow_up",
  listing_information_received: "follow_up",
  photos_requested: "follow_up",
  photos_received: "follow_up",
  verification_pending: "follow_up",
  signed_up: "signed_up",
  listed: "listed",
  other: null,
};

export function formatTaskOutcomeForEngagement(
  outcomeValue: string,
  extraNotes: string
): string {
  const label =
    TASK_OUTCOME_OPTIONS.find((o) => o.value === outcomeValue)?.label || outcomeValue;
  const notes = extraNotes.trim();
  if (!notes) return label;
  if (!label) return notes;
  return `${label} — ${notes}`;
}

export type TaskOutcomeValue = (typeof TASK_OUTCOME_OPTIONS)[number]["value"];

export function getSuggestedPipelineStage(
  outcomeValue: string
): PipelineStage | null {
  return OUTCOME_PIPELINE_SUGGESTIONS[outcomeValue as TaskOutcomeValue] ?? null;
}
