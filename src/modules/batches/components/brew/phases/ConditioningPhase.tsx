"use client";

import { FermentCondPhase } from "./FermentCondPhase";

interface Props {
  batchId: string;
}

export function ConditioningPhase({ batchId }: Props): React.ReactNode {
  return <FermentCondPhase batchId={batchId} phase="conditioning" />;
}
