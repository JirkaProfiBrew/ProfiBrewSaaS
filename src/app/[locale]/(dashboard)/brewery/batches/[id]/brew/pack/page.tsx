import { PackagingPhase } from "@/modules/batches/components/brew/phases/PackagingPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PackagingPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <PackagingPhase batchId={id} />;
}
