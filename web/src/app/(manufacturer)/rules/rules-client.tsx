"use client";

import { useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { DiscountRulesEditor, TestPriceBox } from "@/components/manufacturer/discount-rules-editor";
import { AutonomyPolicyEditor } from "@/components/manufacturer/autonomy-policy-editor";
import { useProductsLite, useTrackScreen } from "@/components/manufacturer/hooks";

export function RulesClient({ initialProductId }: { initialProductId?: string }) {
  useTrackScreen("rules");
  const products = useProductsLite();
  const [picked, setPicked] = useState<string | undefined>(initialProductId);
  const list = (products.data ?? []).filter((p) => p.status !== "archived");
  const product = list.find((p) => p.id === picked) ?? list[0];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Commercial rules"
        description="What the AI may offer on its own, what needs you, and what it must never do. Rules live in the database, not in a prompt."
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>Price tiers</CardTitle>
            <CardDescription>Per product, by order quantity</CardDescription>
          </div>
          {list.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="rules-product" className="text-xs text-muted-foreground">Product</Label>
              <NativeSelect id="rules-product" className="w-64" value={product?.id ?? ""} onChange={(e) => setPicked(e.target.value)}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </NativeSelect>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {products.isLoading ? (
            <LoadingSkeleton variant="table" rows={3} />
          ) : products.error ? (
            <ErrorState error={products.error} onRetry={() => products.refetch()} />
          ) : !product ? (
            <EmptyState
              icon={<Package aria-hidden />}
              title="No products yet"
              description="Add products first; rules are set per product."
              action={<Button asChild><Link href="/products">Go to products</Link></Button>}
            />
          ) : (
            <DiscountRulesEditor key={product.id} product={product} />
          )}
        </CardContent>
      </Card>

      {product && (
        <Card>
          <CardHeader>
            <CardTitle>Test a price</CardTitle>
            <CardDescription>Runs the same evaluate_offer rule the AI uses for {product.name}.</CardDescription>
          </CardHeader>
          <CardContent>
            <TestPriceBox key={product.id} product={product} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Autonomy policies</CardTitle>
          <CardDescription>Autonomous: the AI acts. Approval required: the AI prepares and you confirm. Human only: the AI informs and never acts.</CardDescription>
        </CardHeader>
        <CardContent>
          <AutonomyPolicyEditor />
        </CardContent>
      </Card>
    </div>
  );
}
