import { AdminMashProfileDetail } from "@/admin/mashing-profiles";

interface AdminMashingProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMashingProfilePage({
  params,
}: AdminMashingProfilePageProps): Promise<React.ReactNode> {
  const { id } = await params;
  return <AdminMashProfileDetail id={id} />;
}
