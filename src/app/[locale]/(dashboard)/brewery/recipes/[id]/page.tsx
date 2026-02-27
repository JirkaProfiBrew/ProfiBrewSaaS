import { RecipeDesigner } from "@/modules/recipes";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <RecipeDesigner id={id} />;
}
