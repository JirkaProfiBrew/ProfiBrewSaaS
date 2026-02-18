import { PartnerDetail } from "@/modules/partners";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PartnerDetail id={id} />;
}
