import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MonthlyReportPage(): React.ReactNode {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Měsíční podání</CardTitle>
          <CardDescription>
            Bude implementováno v Sprint 5
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Automatické generování měsíčních daňových přiznání a výkazů.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
