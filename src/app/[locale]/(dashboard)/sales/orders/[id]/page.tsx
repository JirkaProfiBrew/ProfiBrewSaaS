import { OrderDetail } from "@/modules/orders/components/OrderDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: PageProps): Promise<React.ReactNode> {
  const { id } = await params;
  return <OrderDetail id={id} />;
}
