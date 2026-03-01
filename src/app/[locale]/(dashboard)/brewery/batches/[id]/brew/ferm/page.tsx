import { FermentationPhase } from "@/modules/batches/components/brew/phases/FermentationPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FermentationPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <FermentationPhase batchId={id} />;
}
