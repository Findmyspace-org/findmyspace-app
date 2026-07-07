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
    select?: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => {
        eq: (
          col2: string,
          val2: string
        ) => {
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
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
  rpc?: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{
    data: Array<{ completed_at: string; engagement_created: boolean }> | null;
    error: { message: string } | null;
  }>;
};
