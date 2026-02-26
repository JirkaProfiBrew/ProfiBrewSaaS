import { ExciseMovementDetail } from "@/modules/excise/components/ExciseMovementDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExciseMovementDetailPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <ExciseMovementDetail id={id} />;
}
