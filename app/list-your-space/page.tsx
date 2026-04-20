import { redirect } from "next/navigation";

/** Referral entry point: same attribution as /dashboard/new-space?advisor=CODE */
export default async function ListYourSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ advisor?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.advisor;
  const advisor =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const q = advisor ? `?advisor=${encodeURIComponent(advisor)}` : "";
  redirect(`/dashboard/new-space${q}`);
}
