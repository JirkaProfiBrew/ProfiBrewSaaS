import { PlanPhase } from "@/modules/batches/components/brew/phases/PlanPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlanPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <PlanPhase batchId={id} />;
}
