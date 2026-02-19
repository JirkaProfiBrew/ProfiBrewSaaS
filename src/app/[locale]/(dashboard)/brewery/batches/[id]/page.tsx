import { BatchDetail } from "@/modules/batches";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <BatchDetail id={id} />;
}
