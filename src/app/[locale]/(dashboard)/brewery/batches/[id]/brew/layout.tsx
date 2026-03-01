import { redirect } from "next/navigation";
import { getBatchBrewData } from "@/modules/batches/actions";
import { BatchBrewShell } from "@/modules/batches/components/brew/BatchBrewShell";
import type { BatchPhase } from "@/modules/batches/types";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}

export default async function BrewLayout({ children, params }: Props): Promise<React.ReactNode> {
  const { locale, id } = await params;
  const data = await getBatchBrewData(id);

  if (!data) {
    redirect(`/${locale}/brewery/batches`);
  }

  return (
    <BatchBrewShell
      batch={data.batch}
      steps={data.steps}
      measurements={data.measurements}
      notes={data.notes}
      currentPhase={(data.batch.currentPhase ?? "plan") as BatchPhase}
      phaseHistory={data.batch.phaseHistory ?? {}}
    >
      {children}
    </BatchBrewShell>
  );
}
