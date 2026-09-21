/**
 * Self-booking rule (preserved from pre-066):
 * only the legacy listing owner (`spaces.owner_id`) cannot book their own space.
 *
 * Organisation managers (Org Admin, Property Manager, Space Manager) and
 * Global Admins are not blocked unless they are also that space.owner_id.
 */
export function isLegacyOwnerSelfBooking(
  spaceOwnerId: string | null | undefined,
  renterId: string
): boolean {
  return Boolean(spaceOwnerId && spaceOwnerId === renterId);
}
