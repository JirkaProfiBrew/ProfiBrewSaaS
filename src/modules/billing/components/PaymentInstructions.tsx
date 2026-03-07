import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PaymentInstructionsProps {
  tenantId: string;
  amount: string;
  currency: string;
}

export async function PaymentInstructions({
  tenantId,
  amount,
  currency,
}: PaymentInstructionsProps): Promise<React.ReactNode> {
  const t = await getTranslations("billing");

  // Variable symbol = first 8 chars of tenant_id (without dashes)
  const variableSymbol = tenantId.replace(/-/g, "").substring(0, 8);

  return (
    <Card className="border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/20">
      <CardHeader>
        <CardTitle className="text-lg">{t("paymentInstructions")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">{t("paymentAmount")}</span>
          <span className="font-medium">
            {parseFloat(amount).toLocaleString("cs-CZ")} {currency}
          </span>

          <span className="text-muted-foreground">{t("paymentAccount")}</span>
          <span className="font-medium font-mono">123456789/0800</span>

          <span className="text-muted-foreground">{t("paymentVS")}</span>
          <span className="font-medium font-mono">{variableSymbol}</span>
        </div>

        <p className="text-sm text-muted-foreground">
          {t("paymentContact")}{" "}
          <a
            href="mailto:info@profibrew.com"
            className="text-primary hover:underline"
          >
            info@profibrew.com
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
