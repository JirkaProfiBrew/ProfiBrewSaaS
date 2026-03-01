import { redirect } from "next/navigation";
import { getBatchBrewData } from "@/modules/batches/actions";
import { PHASE_ROUTES } from "@/modules/batches/types";
import type { BatchPhase } from "@/modules/batches/types";

interface Props {
  params: Promise<{ locale: string; id: string }>;
}

export default async function BrewRedirectPage({ params }: Props): Promise<React.ReactNode> {
  const { locale, id } = await params;
  const data = await getBatchBrewData(id);

  if (!data) {
    redirect(`/${locale}/brewery/batches`);
  }

  const phase = (data.batch.currentPhase ?? "plan") as BatchPhase;
  const route = PHASE_ROUTES[phase] ?? "plan";
  redirect(`/${locale}/brewery/batches/${id}/brew/${route}`);
}
