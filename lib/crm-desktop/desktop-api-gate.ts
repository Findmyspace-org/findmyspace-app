import {
  canAccessCrmDesktop,
  CRM_DESKTOP_ACCESS_DENIED,
} from "@/lib/crm-desktop/access";
import {
  hasSpacePlaceAccess,
  isSpacePlaceRole,
} from "@/lib/space-place/access";
import { isPlatformAdminRole } from "@/lib/admin-roles";
import type { CrmRole } from "@/lib/space-place/constants";

export type CrmApiAuthState =
  | { kind: "unauthenticated" }
  | {
      kind: "authenticated";
      crmRole: CrmRole | string | null;
      platformRole: string | null;
      crmActive: boolean;
    };

export type CrmApiGateResult =
  | { ok: true; crmRole: CrmRole }
  | { ok: false; status: 401 | 403; message: string };

export type CrmDesktopGateResult =
  | { ok: true; crmRole: CrmRole }
  | { ok: false; status: 401 | 403; message: string };

const SPACE_PLACE_DENIED =
  "The Space Place is only for invited FindMySpace Spacers and Main Admins.";

/** Pure evaluation of requireCrmApi access (no network / service role). */
export function evaluateCrmApiAccess(
  state: CrmApiAuthState
): CrmApiGateResult {
  if (state.kind === "unauthenticated") {
    return { ok: false, status: 401, message: "Unauthorized." };
  }

  let { crmRole, crmActive } = state;
  const { platformRole } = state;

  if (
    !hasSpacePlaceAccess(
      crmRole && isSpacePlaceRole(crmRole)
        ? { role: crmRole as CrmRole, active: crmActive }
        : null
    ) &&
    isPlatformAdminRole(platformRole)
  ) {
    crmRole = "admin";
    crmActive = true;
  }

  if (!crmActive || !crmRole || !isSpacePlaceRole(crmRole)) {
    return { ok: false, status: 403, message: SPACE_PLACE_DENIED };
  }

  return { ok: true, crmRole: crmRole as CrmRole };
}

/** Pure evaluation of requireCrmDesktopApi after CRM API auth succeeds. */
export function evaluateCrmDesktopApiAccess(
  auth: Extract<CrmApiGateResult, { ok: true }>,
  platformRole: string | null
): CrmDesktopGateResult {
  if (
    !canAccessCrmDesktop({
      crmRole: auth.crmRole,
      platformRole,
    })
  ) {
    return {
      ok: false,
      status: 403,
      message: CRM_DESKTOP_ACCESS_DENIED,
    };
  }
  return { ok: true, crmRole: auth.crmRole };
}

/** Simulates desktop overview route: service queries run only after auth passes. */
export function simulateDesktopOverviewRoute(input: {
  authState: CrmApiAuthState;
  fetchStats: () => Promise<unknown>;
}): Promise<{ status: number; message?: string; statsLoaded: boolean }> {
  const crmAuth = evaluateCrmApiAccess(input.authState);
  if (!crmAuth.ok) {
    return Promise.resolve({
      status: crmAuth.status,
      message: crmAuth.message,
      statsLoaded: false,
    });
  }

  const platformRole =
    input.authState.kind === "authenticated"
      ? input.authState.platformRole
      : null;
  const desktopAuth = evaluateCrmDesktopApiAccess(crmAuth, platformRole);
  if (!desktopAuth.ok) {
    return Promise.resolve({
      status: desktopAuth.status,
      message: desktopAuth.message,
      statsLoaded: false,
    });
  }

  return input.fetchStats().then(() => ({
    status: 200,
    statsLoaded: true,
  }));
}
