import { redirect } from "next/navigation";

/** Legacy route — Spaces is now in the bottom nav. */
export default function ProspectsRedirectPage() {
  redirect("/space-place/spaces");
}
