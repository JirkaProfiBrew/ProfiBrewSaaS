"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type {
  RecipeItem,
  RecipeStep,
  Recipe,
  RecipeConstantsOverride,
  BrewingSystemInput,
} from "../types";

import { MaltTab } from "./tabs/MaltTab";
import { HopTab } from "./tabs/HopTab";
import { YeastTab } from "./tabs/YeastTab";
import { AdjunctTab } from "./tabs/AdjunctTab";
import { MashTab } from "./tabs/MashTab";
import { ConstantsTab } from "./tabs/ConstantsTab";
import { CalculationTab } from "./tabs/CalculationTab";

// ── Props ────────────────────────────────────────────────────────

interface RecipeEditorProps {
  recipeId: string;
  // Items by category
  maltItems: RecipeItem[];
  hopItems: RecipeItem[];
  yeastItems: RecipeItem[];
  adjunctItems: RecipeItem[];
  // Steps
  steps: RecipeStep[];
  // Recipe data for calculation tab
  recipe: Recipe | null;
  allItems: RecipeItem[];
  // Calculated values for tabs
  ogPlato: number;
  volumeL: number;
  boilTimeMin: number;
  whirlpoolTempC: number;
  maltPlanKg: number;
  // Style targets
  ibuTarget: { min: number; max: number } | null;
  ebcTarget: { min: number; max: number } | null;
  // Constants
  constants: RecipeConstantsOverride;
  systemDefaults: BrewingSystemInput;
  systemName: string | null;
  // Callbacks
  onAmountChange: (id: string, amount: string) => void;
  onStageChange: (id: string, stage: string) => void;
  onTimeChange: (id: string, time: number | null) => void;
  onTemperatureChange: (id: string, temp: number | null) => void;
  onNotesChange: (id: string, notes: string) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddIngredient: (category: string) => void;
  onConstantsChange: (constants: RecipeConstantsOverride) => void;
  onConstantsReset: () => void;
  onMutate: () => void;
}

// ── Tab definition ───────────────────────────────────────────────

interface TabDef {
  key: string;
  label: string;
  count: number;
}

// ── Component ────────────────────────────────────────────────────

export function RecipeEditor({
  recipeId,
  maltItems,
  hopItems,
  yeastItems,
  adjunctItems,
  steps,
  recipe,
  allItems,
  ogPlato,
  volumeL,
  boilTimeMin,
  whirlpoolTempC,
  maltPlanKg,
  ibuTarget,
  ebcTarget,
  constants,
  systemDefaults,
  systemName,
  onAmountChange,
  onStageChange,
  onTimeChange,
  onTemperatureChange,
  onNotesChange,
  onRemove,
  onReorder,
  onAddIngredient,
  onConstantsChange,
  onConstantsReset,
  onMutate,
}: RecipeEditorProps): React.ReactNode {
  const t = useTranslations("recipes");
  const [activeTab, setActiveTab] = useState("malts");

  // Tab definitions with badge counts
  const tabs: TabDef[] = useMemo(
    () => [
      { key: "malts", label: t("designer.tabs.malts"), count: maltItems.length },
      { key: "hops", label: t("designer.tabs.hops"), count: hopItems.length },
      { key: "yeast", label: t("designer.tabs.yeast"), count: yeastItems.length },
      { key: "adjuncts", label: t("designer.tabs.adjuncts"), count: adjunctItems.length },
      { key: "mashing", label: t("designer.tabs.mashing"), count: steps.length },
      { key: "constants", label: t("designer.tabs.constants"), count: 0 },
      { key: "calculation", label: t("designer.tabs.calculation"), count: 0 },
    ],
    [t, maltItems.length, hopItems.length, yeastItems.length, adjunctItems.length, steps.length],
  );

  return (
    <div className="rounded-lg border bg-card">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b px-4">
          <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0 py-2">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md px-3 py-1.5 text-sm"
              >
                {tab.label}
                {tab.count > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="p-4">
          <TabsContent value="malts" className="mt-0">
            <MaltTab
              items={maltItems}
              maltPlanKg={maltPlanKg}
              ebcTarget={ebcTarget}
              onAmountChange={onAmountChange}
              onRemove={onRemove}
              onReorder={onReorder}
              onAdd={() => onAddIngredient("malt")}
            />
          </TabsContent>

          <TabsContent value="hops" className="mt-0">
            <HopTab
              items={hopItems}
              volumeL={volumeL}
              ogPlato={ogPlato}
              boilTimeMin={boilTimeMin}
              whirlpoolTempC={whirlpoolTempC}
              ibuTarget={ibuTarget}
              onAmountChange={onAmountChange}
              onStageChange={onStageChange}
              onTimeChange={onTimeChange}
              onTemperatureChange={onTemperatureChange}
              onRemove={onRemove}
              onReorder={onReorder}
              onAdd={() => onAddIngredient("hop")}
            />
          </TabsContent>

          <TabsContent value="yeast" className="mt-0">
            <YeastTab
              items={yeastItems}
              ogPlato={ogPlato}
              onAmountChange={onAmountChange}
              onRemove={onRemove}
              onReorder={onReorder}
              onAdd={() => onAddIngredient("yeast")}
            />
          </TabsContent>

          <TabsContent value="adjuncts" className="mt-0">
            <AdjunctTab
              items={adjunctItems}
              onAmountChange={onAmountChange}
              onStageChange={onStageChange}
              onTimeChange={onTimeChange}
              onNotesChange={onNotesChange}
              onRemove={onRemove}
              onReorder={onReorder}
              onAdd={() => onAddIngredient("adjunct")}
            />
          </TabsContent>

          <TabsContent value="mashing" className="mt-0">
            <MashTab
              recipeId={recipeId}
              steps={steps}
              onMutate={onMutate}
            />
          </TabsContent>

          <TabsContent value="constants" className="mt-0">
            <ConstantsTab
              constants={constants}
              systemDefaults={systemDefaults}
              systemName={systemName}
              onChange={onConstantsChange}
              onReset={onConstantsReset}
            />
          </TabsContent>

          <TabsContent value="calculation" className="mt-0">
            <CalculationTab
              recipeId={recipeId}
              recipe={recipe}
              items={allItems}
              onMutate={onMutate}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
