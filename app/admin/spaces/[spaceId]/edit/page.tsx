import { AdminSpaceEditPage } from "@/app/components/admin/AdminSpaceEditPage";

type PageProps = {
  params: Promise<{ spaceId: string }>;
};

export default async function AdminSpaceEditRoutePage({ params }: PageProps) {
  const { spaceId } = await params;
  return <AdminSpaceEditPage spaceId={spaceId} />;
}
