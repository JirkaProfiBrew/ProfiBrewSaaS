import { PrepPhase } from "@/modules/batches/components/brew/phases/PrepPhase";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PrepPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <PrepPhase batchId={id} />;
}
