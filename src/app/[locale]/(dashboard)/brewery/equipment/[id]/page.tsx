import { EquipmentDetail } from "@/modules/equipment";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <EquipmentDetail id={id} />;
}
