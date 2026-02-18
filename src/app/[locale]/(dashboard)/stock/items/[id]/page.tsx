import { ItemDetail } from "@/modules/items";

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <ItemDetail id={id} backHref="/stock/items" />;
}
