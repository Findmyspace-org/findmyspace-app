/** Assignment on create: Spacers always self; admins/office managers use selection or self. */
export function resolveAssignedToForCreate(
  canAssignToOthers: boolean,
  userId: string,
  selectedAssignedTo: string
): string {
  if (!canAssignToOthers) return userId;
  return selectedAssignedTo.trim() || userId;
}
