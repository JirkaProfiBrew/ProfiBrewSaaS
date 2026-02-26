import { MonthlyReportDetail } from "@/modules/excise/components/MonthlyReportDetail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MonthlyReportDetailPage({ params }: Props): Promise<React.ReactNode> {
  const { id } = await params;
  return <MonthlyReportDetail id={id} />;
}
