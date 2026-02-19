import { WarehouseDetail } from "@/modules/warehouses";

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <WarehouseDetail id={id} />;
}
