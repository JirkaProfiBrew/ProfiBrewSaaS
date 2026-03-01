import { CompletedPhase } from "@/modules/batches/components/brew/phases/CompletedPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CompletedPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <CompletedPhase batchId={id} />;
}
