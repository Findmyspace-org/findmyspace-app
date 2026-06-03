import type { PipelineStage, CrmRole } from "./constants";

export type { CrmRole };

export type CrmProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: CrmRole;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CrmOrganisation = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  assigned_to: string | null;
  pipeline_stage: PipelineStage;
  website: string | null;
  address: string | null;
  notes: string | null;
  signed_up_at: string | null;
  listed_at: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContact = {
  id: string;
  organisation_id: string;
  assigned_to: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmEngagement = {
  id: string;
  organisation_id: string;
  contact_id: string | null;
  type: string;
  summary: string | null;
  outcome: string | null;
  direction: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
};

export type CrmTask = {
  id: string;
  organisation_id: string | null;
  contact_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  owner_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmOrganisationWithRelations = CrmOrganisation & {
  crm_contacts?: CrmContact[];
  assigned_profile?: Pick<CrmProfile, "id" | "full_name"> | null;
};

export type CrmTaskWithRelations = CrmTask & {
  crm_organisations?: Pick<
    CrmOrganisation,
    "id" | "name" | "pipeline_stage"
  > | null;
  crm_contacts?: Pick<
    CrmContact,
    "id" | "full_name" | "phone" | "whatsapp" | "email"
  > | null;
  owner_profile?: Pick<CrmProfile, "id" | "full_name"> | null;
};

export type CrmEngagementWithRelations = CrmEngagement & {
  crm_organisations?: Pick<CrmOrganisation, "id" | "name"> | null;
  crm_contacts?: Pick<CrmContact, "id" | "full_name"> | null;
  creator_profile?: Pick<CrmProfile, "id" | "full_name"> | null;
};

export type CrmEmailMessage = {
  id: string;
  organisation_id: string | null;
  contact_id: string | null;
  engagement_id: string | null;
  message_id: string;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  direction: string;
  sent_at: string | null;
  imported_at: string;
  created_by: string | null;
  created_at: string;
};

export type CrmEmailMessageWithRelations = CrmEmailMessage & {
  crm_contacts?: Pick<CrmContact, "id" | "full_name" | "email"> | null;
  crm_organisations?: Pick<CrmOrganisation, "id" | "name"> | null;
};
