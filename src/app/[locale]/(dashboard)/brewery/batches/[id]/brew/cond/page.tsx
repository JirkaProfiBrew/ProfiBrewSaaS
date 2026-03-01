import { ConditioningPhase } from "@/modules/batches/components/brew/phases/ConditioningPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConditioningPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <ConditioningPhase batchId={id} />;
}
