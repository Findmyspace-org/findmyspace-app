import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeOrganisationAccessEmail } from "@/lib/access/organisation-access-email";

export type AuthUserEmailLookup = {
  id: string;
  email: string;
  emailConfirmed: boolean;
};

type AuthUserLike = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

function mapAuthUser(user: AuthUserLike): AuthUserEmailLookup | null {
  const email = normalizeOrganisationAccessEmail(user.email ?? null);
  if (!email) return null;
  return {
    id: user.id,
    email,
    emailConfirmed: Boolean(user.email_confirmed_at),
  };
}

/**
 * Server-only lookup. Never expose auth.users to the browser.
 * Tries Admin getUserByEmail, then paginated listUsers.
 */
export async function lookupAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<AuthUserEmailLookup | null> {
  const normalized = normalizeOrganisationAccessEmail(email);
  if (!normalized) return null;

  const adminApi = admin.auth.admin as {
    getUserByEmail?: (
      value: string
    ) => Promise<{ data: { user: AuthUserLike } | null; error: { message: string } | null }>;
    listUsers: (params: {
      page: number;
      perPage: number;
    }) => Promise<{
      data: { users: AuthUserLike[] };
      error: { message: string } | null;
    }>;
  };

  if (typeof adminApi.getUserByEmail === "function") {
    const { data, error } = await adminApi.getUserByEmail(normalized);
    if (!error && data?.user) {
      const mapped = mapAuthUser(data.user);
      if (mapped && mapped.email === normalized) return mapped;
    }
  }

  let page = 1;
  const perPage = 200;
  while (page <= 10) {
    const { data, error } = await adminApi.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const match = (data.users || []).find(
      (user) => normalizeOrganisationAccessEmail(user.email ?? null) === normalized
    );
    if (match) return mapAuthUser(match);
    if ((data.users || []).length < perPage) break;
    page += 1;
  }

  return null;
}
