import { ItemDetail } from "@/modules/items";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ItemDetail id={id} backHref="/brewery/materials" />;
}
