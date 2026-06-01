import { PIPELINE_STAGES } from "./constants";
import type { SmartCaptureExtracted } from "./smart-capture-types";
import { coercePipelineStage } from "./smart-capture-match";

const DEFAULT_MODEL = "gpt-4o-mini";

export async function extractSmartCaptureFields(
  text: string,
  referenceDateIso: string
): Promise<SmartCaptureExtracted> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const stages = PIPELINE_STAGES.join(", ");

  const systemPrompt = `You extract structured CRM data from informal notes for a South African venue outreach team.
Today is ${referenceDateIso} (ISO date). Resolve relative dates like "Friday" or "next week" to YYYY-MM-DD.
Return ONLY valid JSON with this exact shape (use null when unknown):
{
  "organisation_name": string | null,
  "contact_name": string | null,
  "email": string | null,
  "phone": string | null,
  "notes": string | null,
  "pipeline_stage": ${stages} | null,
  "follow_up_task": string | null,
  "follow_up_date": "YYYY-MM-DD" | null,
  "engagement_summary": string | null,
  "engagement_type": "call" | "whatsapp" | "email" | "meeting" | "note" | null
}
Rules:
- organisation_name is the venue/business/school/municipality, not a person.
- contact_name is the person spoken with.
- phone: normalize to digits with optional leading + if present in text.
- engagement_summary: one sentence of what happened.
- pipeline_stage: infer interest level (e.g. interested in listing -> in_progress or follow_up).`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errText}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }

  return {
    organisation_name:
      typeof parsed.organisation_name === "string"
        ? parsed.organisation_name
        : null,
    contact_name:
      typeof parsed.contact_name === "string" ? parsed.contact_name : null,
    email: typeof parsed.email === "string" ? parsed.email : null,
    phone: typeof parsed.phone === "string" ? parsed.phone : null,
    notes: typeof parsed.notes === "string" ? parsed.notes : null,
    pipeline_stage: coercePipelineStage(
      typeof parsed.pipeline_stage === "string"
        ? parsed.pipeline_stage
        : null
    ),
    follow_up_task:
      typeof parsed.follow_up_task === "string" ? parsed.follow_up_task : null,
    follow_up_date:
      typeof parsed.follow_up_date === "string"
        ? parsed.follow_up_date
        : null,
    engagement_summary:
      typeof parsed.engagement_summary === "string"
        ? parsed.engagement_summary
        : null,
    engagement_type:
      typeof parsed.engagement_type === "string"
        ? parsed.engagement_type
        : null,
  };
}
