/**
 * Brewing Systems module — type definitions.
 * Drizzle decimal columns return strings.
 */

export interface BrewingSystem {
  id: string;
  tenantId: string;
  shopId: string | null;
  shopName?: string;
  name: string;
  description: string | null;
  isPrimary: boolean;
  batchSizeL: string;
  efficiencyPct: string;
  kettleVolumeL: string | null;
  kettleLossPct: string | null;
  whirlpoolLossPct: string | null;
  fermenterVolumeL: string | null;
  fermentationLossPct: string | null;
  extractEstimate: string | null;
  waterPerKgMalt: string | null;
  waterReserveL: string | null;
  timePreparation: number | null;
  timeLautering: number | null;
  timeWhirlpool: number | null;
  timeTransfer: number | null;
  timeCleanup: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface BrewingSystemVolumes {
  batchSizeL: number;
  preboilVolumeL: number;
  postBoilVolumeL: number;
  postWhirlpoolL: number;
  intoFermenterL: number;
  finishedBeerL: number;
}

// ── Volume calculations (pure function) ────────────────────────

export function calculateVolumes(system: {
  batchSizeL: string;
  kettleLossPct: string | null;
  whirlpoolLossPct: string | null;
  fermentationLossPct: string | null;
}): BrewingSystemVolumes {
  const batchSizeL = Number(system.batchSizeL) || 0;
  const kettleLoss = Number(system.kettleLossPct) || 0;
  const whirlpoolLoss = Number(system.whirlpoolLossPct) || 0;
  const fermentationLoss = Number(system.fermentationLossPct) || 0;

  // batch_size_l = post-boil volume (mladina)
  const postBoilVolumeL = batchSizeL;
  // pre-boil = batch_size / (1 - kettle_loss/100)
  const preboilVolumeL =
    kettleLoss < 100 ? batchSizeL / (1 - kettleLoss / 100) : batchSizeL;
  // post-whirlpool
  const postWhirlpoolL = batchSizeL * (1 - whirlpoolLoss / 100);
  // into fermenter = post-whirlpool
  const intoFermenterL = postWhirlpoolL;
  // finished beer
  const finishedBeerL = intoFermenterL * (1 - fermentationLoss / 100);

  return {
    batchSizeL,
    preboilVolumeL: Math.round(preboilVolumeL * 10) / 10,
    postBoilVolumeL: Math.round(postBoilVolumeL * 10) / 10,
    postWhirlpoolL: Math.round(postWhirlpoolL * 10) / 10,
    intoFermenterL: Math.round(intoFermenterL * 10) / 10,
    finishedBeerL: Math.round(finishedBeerL * 10) / 10,
  };
}
