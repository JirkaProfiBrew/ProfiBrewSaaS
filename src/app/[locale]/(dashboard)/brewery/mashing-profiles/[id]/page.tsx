import { MashProfileDetail } from "@/modules/mashing-profiles";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MashingProfileDetailPage({
  params,
}: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <MashProfileDetail id={id} />;
}
