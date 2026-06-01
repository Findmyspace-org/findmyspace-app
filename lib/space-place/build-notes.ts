export function buildOrganisationNotes({
  notes,
  leadSource,
  opportunitySize,
}: {
  notes: string;
  leadSource: string;
  opportunitySize: string;
}): string | null {
  const parts: string[] = [];
  const trimmedNotes = notes.trim();
  if (trimmedNotes) parts.push(trimmedNotes);
  const trimmedLead = leadSource.trim();
  if (trimmedLead) parts.push(`Lead source: ${trimmedLead}`);
  const trimmedOpp = opportunitySize.trim();
  if (trimmedOpp) parts.push(`Estimated opportunity: ${trimmedOpp}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
