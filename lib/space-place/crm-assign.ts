/** Assignment on create: Spacers always self; admins use selection or self. */
export function resolveAssignedToForCreate(
  isAdmin: boolean,
  userId: string,
  selectedAssignedTo: string
): string {
  if (!isAdmin) return userId;
  return selectedAssignedTo.trim() || userId;
}
