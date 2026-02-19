import { LotDetail } from "@/modules/material-lots/components/LotDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LotDetailPage({
  params,
}: PageProps): Promise<React.ReactNode> {
  const { id } = await params;
  return <LotDetail id={id} />;
}
