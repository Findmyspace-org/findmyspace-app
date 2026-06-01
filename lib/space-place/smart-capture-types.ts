import type { PipelineStage } from "./constants";

export type SmartCaptureExtracted = {
  organisation_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  pipeline_stage: PipelineStage | null;
  follow_up_task: string | null;
  follow_up_date: string | null;
  engagement_summary: string | null;
  engagement_type: string | null;
};

export type SmartCaptureEntityMatch = {
  action: "match" | "create";
  id: string | null;
  name: string;
  score?: number;
};

export type SmartCaptureParseResult = {
  rawText: string;
  extracted: SmartCaptureExtracted;
  organisation: SmartCaptureEntityMatch & {
    pipeline_stage: PipelineStage | null;
    notes: string | null;
  };
  contact: SmartCaptureEntityMatch & {
    email: string | null;
    phone: string | null;
  };
  followUp: {
    title: string | null;
    due_date: string | null;
  };
  engagement: {
    type: string;
    summary: string;
  };
};

export type SmartCaptureConfirmPayload = {
  rawText: string;
  organisation: {
    create: boolean;
    id: string | null;
    name: string;
    pipeline_stage: PipelineStage | null;
    notes: string | null;
  };
  contact: {
    create: boolean;
    id: string | null;
    full_name: string;
    email: string | null;
    phone: string | null;
  };
  engagement: {
    type: string;
    summary: string;
    outcome: string | null;
  };
  followUp: {
    create: boolean;
    title: string | null;
    due_date: string | null;
  };
};
