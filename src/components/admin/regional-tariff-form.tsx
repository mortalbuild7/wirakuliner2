"use client";

import { useState, useTransition } from "react";
import { updateRegionalTariff } from "@/app/actions/tariffActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

type TariffRow = {
  id: string;
  province_id: number;
  city_id: number | null;
  service_type: "NGOJEK" | "NGOMOBIL" | "PAKET";
  base_fare: number;
  price_per_km: number;
  merchant_markup: number;
};

export function RegionalTariffForm({
  tariffs,
  lockedProvinceId,
  canEdit,
}: {
  tariffs: TariffRow[];
  lockedProvinceId?: number | null;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateRegionalTariff({
        tariffId: formData.get("tariffId") || undefined,
        serviceType: (formData.get("serviceType") || "NGOJEK") as
          | "NGOJEK"
          | "NGOMOBIL"
          | "PAKET",
        provinceId: formData.get("provinceId"),
        cityId: formData.get("cityId") || null,
        baseFare: formData.get("baseFare"),
        pricePerKm: formData.get("pricePerKm"),
        merchantMarkup: formData.get("merchantMarkup"),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.message ?? "Berhasil");
    });
  }

  if (!canEdit) {
    return (
      <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900">
        CITY_ADMIN hanya dapat melihat tarif — mutasi dilarang keras oleh RLS &
        Server Action.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}
      {success && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-900">
          {success}
        </Alert>
      )}

      {tariffs.map((t) => (
        <form
          key={t.id}
          className="rounded-xl border p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
        >
          <input type="hidden" name="tariffId" value={t.id} />
          <input type="hidden" name="serviceType" value={t.service_type} />
          <input type="hidden" name="provinceId" value={t.province_id} />
          <input type="hidden" name="cityId" value={t.city_id ?? ""} />
          <p className="font-medium text-sm">
            {t.service_type} · Provinsi {t.province_id}
            {t.city_id ? ` · Kota ${t.city_id}` : " · (default provinsi)"}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`base-${t.id}`}>Tarif dasar (Rp)</Label>
              <Input
                id={`base-${t.id}`}
                name="baseFare"
                type="number"
                min={0}
                step={500}
                defaultValue={t.base_fare}
                disabled={!!lockedProvinceId && lockedProvinceId !== t.province_id}
              />
            </div>
            <div>
              <Label htmlFor={`km-${t.id}`}>Harga / km (Rp)</Label>
              <Input
                id={`km-${t.id}`}
                name="pricePerKm"
                type="number"
                min={0}
                step={100}
                defaultValue={t.price_per_km}
                disabled={!!lockedProvinceId && lockedProvinceId !== t.province_id}
              />
            </div>
            <div>
              <Label htmlFor={`markup-${t.id}`}>Markup merchant (Rp)</Label>
              <Input
                id={`markup-${t.id}`}
                name="merchantMarkup"
                type="number"
                min={0}
                step={100}
                defaultValue={t.merchant_markup}
                disabled={!!lockedProvinceId && lockedProvinceId !== t.province_id}
              />
            </div>
          </div>
          <Button type="submit" disabled={pending} size="sm">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simpan tarif
          </Button>
        </form>
      ))}
    </div>
  );
}
