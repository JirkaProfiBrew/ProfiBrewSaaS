"use client";

import { FermentCondPhase } from "./FermentCondPhase";

interface Props {
  batchId: string;
}

export function FermentationPhase({ batchId }: Props): React.ReactNode {
  return <FermentCondPhase batchId={batchId} phase="fermentation" />;
}
