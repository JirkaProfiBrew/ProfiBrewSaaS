import { ShopDetail } from "@/modules/shops";

export default async function ShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ShopDetail id={id} />;
}
