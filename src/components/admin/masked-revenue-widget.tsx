"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/utils";

/** Widget omset nasional — anti shoulder surfing di tempat umum. */
export function MaskedRevenueWidget({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: number;
  hint?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-stone-950">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "Sembunyikan omset" : "Tampilkan omset"}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tracking-tight">
          {revealed ? formatIdr(amount) : "Rp *****"}
        </p>
        {hint && (
          <p className="mt-1 text-xs text-muted-foreground">
            {revealed ? hint : "Ketuk ikon mata untuk menampilkan angka"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
