import { supabase } from "@/lib/supabase";

/** Untyped CRM tables until generated Supabase types include them. */
export const crmDb = {
  profiles: () => supabase.from("crm_profiles") as any,
  organisations: () => supabase.from("crm_organisations") as any,
  contacts: () => supabase.from("crm_contacts") as any,
  engagements: () => supabase.from("crm_engagements") as any,
  tasks: () => supabase.from("crm_tasks") as any,
  inbox: () => supabase.from("crm_inbox") as any,
};
