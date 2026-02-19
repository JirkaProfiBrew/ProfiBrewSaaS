import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExcisePage(): React.ReactNode {
  return (
    <div className="flex flex-col gap-6 p-6">
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Daňové pohyby</CardTitle>
          <CardDescription>
            Bude implementováno v Sprint 5
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Evidence celních prohlášení a daňových pohybů pro správu spotřební daně.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
