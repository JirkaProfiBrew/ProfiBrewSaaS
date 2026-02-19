import { StockIssueDetail } from "@/modules/stock-issues/components/StockIssueDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StockMovementDetailPage({
  params,
}: PageProps): Promise<React.ReactNode> {
  const { id } = await params;
  return <StockIssueDetail id={id} />;
}
