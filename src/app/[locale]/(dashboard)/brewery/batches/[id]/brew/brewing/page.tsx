import { BrewingPhase } from "@/modules/batches/components/brew/phases/BrewingPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BrewingPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <BrewingPhase batchId={id} />;
}
