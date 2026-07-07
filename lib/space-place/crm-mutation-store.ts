/** Minimal Supabase-style client surface for CRM mutations (enables unit tests). */
export type CrmMutationStore = {
  tasks: () => {
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    insert: (
      row: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>;
  };
  engagements: () => {
    insert: (
      row: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>;
  };
  organisations: () => {
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  contacts: () => {
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};
