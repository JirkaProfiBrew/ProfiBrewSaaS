import { BrewingSystemDetail } from "@/modules/brewing-systems";

export default async function BrewingSystemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <BrewingSystemDetail id={id} />;
}
