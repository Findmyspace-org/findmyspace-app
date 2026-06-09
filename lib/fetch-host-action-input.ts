import type { SupabaseClient } from "@supabase/supabase-js";
import type { HostActionInput } from "@/lib/host-action-required";

/** Load host verification/listing signals for action cards (client or server). */
export async function fetchHostActionInput(
  client: SupabaseClient,
  userId: string
): Promise<HostActionInput | null> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user || user.id !== userId) return null;

  const [
    { data: rawProfile, error: profileError },
    { data: rawSpaces, error: spacesError },
    { data: docs },
    { data: rawBank },
    { data: ownershipDocs },
  ] = await Promise.all([
    client
      .from("profiles")
      .select("owner_verification_status, bank_verification_status")
      .eq("id", userId)
      .maybeSingle(),
    client
      .from("spaces")
      .select("id, title, ownership_proof_status, status")
      .eq("owner_id", userId),
    client
      .from("owner_verification_documents")
      .select("document_type")
      .eq("owner_id", userId),
    (client.from("owner_bank_details") as ReturnType<typeof client.from>)
      .select("proof_of_bank_url")
      .eq("owner_id", userId)
      .maybeSingle(),
    client
      .from("listing_ownership_documents")
      .select("space_id")
      .eq("owner_id", userId),
  ]);

  if (profileError || spacesError) return null;

  const docTypes =
    ((docs as { document_type: string }[]) || []).map((d) => d.document_type) ||
    [];
  const bank = rawBank as { proof_of_bank_url: string | null } | null;
  const ownershipDocSpaceIds = new Set(
    ((ownershipDocs as { space_id: string | null }[]) || [])
      .map((row) => row.space_id)
      .filter((id): id is string => Boolean(id))
  );

  return {
    profile: (rawProfile as HostActionInput["profile"]) || null,
    hasIdFront: docTypes.includes("id_front"),
    hasIdBack: docTypes.includes("id_back"),
    bankProofExists: Boolean(bank?.proof_of_bank_url),
    spaces: ((rawSpaces || []) as HostActionInput["spaces"]) || [],
    ownershipDocSpaceIds,
  };
}
