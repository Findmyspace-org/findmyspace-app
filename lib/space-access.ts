import { isPlatformAdminRole } from "@/lib/admin-roles";

export type SpaceAccessActor = {
  userId: string;
  isPlatformAdmin: boolean;
};

export type SpaceAccessContext = SpaceAccessActor & {
  spaceId: string;
  spaceOwnerId: string | null;
  propertyId: string | null;
  propertyOwnerId: string | null;
  assignedSpaceIds: readonly string[];
};

export type PropertyAccessContext = SpaceAccessActor & {
  propertyId: string;
  propertyOwnerId: string | null;
  assignedSpaceIdsOnProperty: readonly string[];
};

export function canManageProperty(ctx: PropertyAccessContext): boolean {
  if (ctx.isPlatformAdmin) return true;
  return Boolean(ctx.propertyOwnerId && ctx.propertyOwnerId === ctx.userId);
}

export function canViewProperty(ctx: PropertyAccessContext): boolean {
  if (canManageProperty(ctx)) return true;
  return ctx.assignedSpaceIdsOnProperty.length > 0;
}

export function canManagePropertyUsers(ctx: PropertyAccessContext): boolean {
  return canManageProperty(ctx);
}

export function canManageSpace(ctx: SpaceAccessContext): boolean {
  if (ctx.isPlatformAdmin) return true;
  if (ctx.spaceOwnerId && ctx.spaceOwnerId === ctx.userId) return true;
  if (ctx.propertyOwnerId && ctx.propertyOwnerId === ctx.userId) return true;
  return ctx.assignedSpaceIds.includes(ctx.spaceId);
}

export function isSpaceManagerOnly(ctx: PropertyAccessContext): boolean {
  return !canManageProperty(ctx) && ctx.assignedSpaceIdsOnProperty.length > 0;
}

export function roleFromProfile(role: string | null | undefined): boolean {
  return isPlatformAdminRole(role);
}
