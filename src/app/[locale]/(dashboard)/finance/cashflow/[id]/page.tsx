import { CashFlowDetail } from "@/modules/cashflows/components/CashFlowDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CashFlowDetailPage({ params }: PageProps): Promise<React.ReactNode> {
  const { id } = await params;
  return <CashFlowDetail id={id} />;
}
