"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getProductsByBaseItem } from "@/modules/batches/actions";

interface ItemProductsTabProps {
  itemId: string;
}

export function ItemProductsTab({ itemId }: ItemProductsTabProps): React.ReactNode {
  const t = useTranslations("items");
  const router = useRouter();

  const [products, setProducts] = useState<Array<{
    id: string;
    name: string;
    code: string | null;
    baseItemQuantity: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getProductsByBaseItem(itemId)
      .then((data) => {
        if (!cancelled) {
          setProducts(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load products:", err);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [itemId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        ...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => router.push(`/stock/items/new?baseItemId=${itemId}`)}
        >
          <Plus className="mr-1 size-4" />
          {t("productionTabs.addProduct")}
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          {t("productionTabs.productsEmpty")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("productionTabs.productName")}</TableHead>
              <TableHead>{t("productionTabs.productCode")}</TableHead>
              <TableHead className="text-right">{t("productionTabs.productVolume")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => router.push(`/stock/items/${p.id}`)}
              >
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.code ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.baseItemQuantity ? `${p.baseItemQuantity} L` : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
