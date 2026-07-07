export type CrmOrganisationContactSummary = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
};

export type CrmOrganisationListRow = {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  pipeline_stage: string;
  status: string;
  assigned_to: string | null;
  assigned_name: string | null;
  primary_contact_id: string | null;
  primary_contact_name: string | null;
  primary_contact_role: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  additional_contacts: CrmOrganisationContactSummary[];
  contact_count: number;
  space_count: number;
  property_count: number;
  last_interaction_at: string | null;
  last_interaction_summary: string | null;
  next_task_id: string | null;
  next_task_due: string | null;
  next_task_title: string | null;
  next_action_title: string | null;
  next_action_date: string | null;
  next_action_date_group: "overdue" | "today" | "future" | "none";
  pipeline_manual_rank: number | null;
  pipeline_rank_updated_at: string | null;
  pipeline_rank_updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContactListRow = {
  id: string;
  organisation_id: string;
  organisation_name: string;
  organisation_type: string | null;
  organisation_pipeline_stage: string | null;
  full_name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  last_interaction_at: string | null;
  last_interaction_summary: string | null;
  next_task_id: string | null;
  next_task_due: string | null;
  next_task_title: string | null;
  updated_at: string;
};

export type CrmTaskListRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  owner_id: string | null;
  owner_name: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  pipeline_stage: string | null;
};

export type CrmSpaceListRow = {
  id: string;
  title: string;
  city: string | null;
  suburb: string | null;
  property_id: string | null;
  property_name: string | null;
  listing_status: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  contact_id: string | null;
  contact_name: string | null;
  pipeline_stage: string | null;
  last_interaction_at: string | null;
  next_task_id: string | null;
  next_task_due: string | null;
  next_task_title: string | null;
  assigned_name: string | null;
};

export type CrmPipelineListRow = {
  organisation_id: string;
  organisation_name: string;
  organisation_type: string | null;
  pipeline_stage: string;
  main_contact_id: string | null;
  main_contact_name: string | null;
  main_contact_role: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  contact_count: number;
  space_count: number;
  property_count: number;
  last_interaction_at: string | null;
  last_interaction_summary: string | null;
  next_task_id: string | null;
  next_task_due: string | null;
  next_task_title: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  address: string | null;
  updated_at: string | null;
};

export type CrmPipelineStageCounts = Record<string, number>;

export type CrmOverviewStats = {
  dueToday: number;
  overdue: number;
  upcomingWeek: number;
  openPipeline: number;
  orgsNoNextStep: number;
  contactsStale: number;
  recentNotes: number;
  recentUpdates: number;
  tasksByOwner: { owner_id: string | null; owner_name: string; count: number }[];
};

export type CrmSearchResultGroup = {
  type: "organisation" | "contact" | "space" | "property";
  items: {
    id: string;
    title: string;
    subtitle: string | null;
    href: string;
  }[];
};

export type PaginatedResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type CrmListFilters = {
  q?: string;
  assignedTo?: string;
  pipelineStage?: string;
  organisationType?: string;
  overdue?: boolean;
  noNextStep?: boolean;
  noFollowUpDate?: boolean;
  noContact?: boolean;
  noSpaces?: boolean;
  noEmail?: boolean;
  noPhone?: boolean;
  staleInteraction?: boolean;
  organisationId?: string;
  contactRole?: string;
  status?: string;
  bucket?: string;
  ownerId?: string;
  sort?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  preset?: string;
  boardMode?: boolean;
  boardSort?: string;
};
