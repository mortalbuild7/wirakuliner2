"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableCitySelect } from "@/components/ui/searchable-city-select";
import {
  recruitNewAdmin,
  type RecruitAdminInput,
} from "@/app/actions/adminRecruitActions";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import type { AdminTier } from "@/app/utils/adminAuth";
import { getCitiesByProvinceId } from "@/lib/indonesia-regions";
import { Loader2, Mail, UserPlus } from "lucide-react";

const SELECT_CLASS =
  "mt-1 flex h-11 w-full rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-sm text-slate-900 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60";

export function AdminRecruitForm({
  recruiterTier,
  provinces,
  defaultProvinceId,
  provinceLocked,
}: {
  recruiterTier: AdminTier;
  provinces: IndonesiaProvince[];
  defaultProvinceId: number;
  provinceLocked: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    adminRole: recruiterTier === "SUPER_ADMIN" ? "PROVINCE_ADMIN" : "CITY_ADMIN",
    provinceId: String(defaultProvinceId),
  });

  const [selectedCityName, setSelectedCityName] = useState("");
  const activeProvinceId = form.provinceId;

  const showCityField = useMemo(
    () => form.adminRole === "CITY_ADMIN",
    [form.adminRole]
  );

  const cities = useMemo(() => {
    const pid = Number(activeProvinceId);
    if (!Number.isInteger(pid) || pid <= 0) return [];
    return getCitiesByProvinceId(pid);
  }, [activeProvinceId]);

  const cityValidForProvince = useMemo(() => {
    if (!selectedCityName) return false;
    return cities.includes(selectedCityName);
  }, [cities, selectedCityName]);

  const handleProvinceChange = useCallback((provinceId: string) => {
    setForm((f) => ({ ...f, provinceId }));
    setSelectedCityName("");
    setError(null);
  }, []);

  const handleAdminRoleChange = useCallback((adminRole: string) => {
    setForm((f) => ({ ...f, adminRole }));
    setSelectedCityName("");
    setError(null);
  }, []);

  useEffect(() => {
    if (!showCityField) {
      setSelectedCityName("");
      return;
    }
    if (
      selectedCityName &&
      !cities.includes(selectedCityName)
    ) {
      setSelectedCityName("");
    }
  }, [showCityField, cities, selectedCityName]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const provinceId = Number(form.provinceId);

    if (showCityField) {
      if (!selectedCityName) {
        setError("Kota cabang wajib dipilih");
        return;
      }
      if (!cityValidForProvince) {
        setError("Kota yang dipilih tidak sesuai dengan provinsi induk");
        return;
      }
    }

    const payload: RecruitAdminInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      adminRole: form.adminRole as "PROVINCE_ADMIN" | "CITY_ADMIN",
      provinceId,
      cityName: showCityField ? selectedCityName : undefined,
    };

    startTransition(async () => {
      const res = await recruitNewAdmin(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(res.message);
      setForm((f) => ({
        ...f,
        name: "",
        email: "",
      }));
      setSelectedCityName("");
    });
  }

  const canSubmitCity =
    !showCityField || (cityValidForProvince && cities.length > 0);

  return (
    <Card className="mt-6 max-w-2xl rounded-2xl border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
          <UserPlus className="h-5 w-5 text-emerald-600" aria-hidden />
          Form Rekrutmen Admin
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4 text-slate-900">
            {error}
          </Alert>
        )}
        {success && (
          <Alert className="mb-4 border-emerald-500/40 bg-emerald-50 text-emerald-900">
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            {success}
          </Alert>
        )}

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-slate-900">Nama lengkap</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
              disabled={pending}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-slate-900">Email korporat</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nama@wirakuliner.web.id"
              required
              disabled={pending}
            />
            <p className="mt-1 text-xs text-slate-600">
              Email aktivasi & instruksi MFA dikirim otomatis dari{" "}
              <strong>admin@wirakuliner.web.id</strong>.
            </p>
          </div>

          {recruiterTier === "SUPER_ADMIN" && (
            <div className="sm:col-span-2">
              <Label className="text-slate-900">Tier admin</Label>
              <select
                className={SELECT_CLASS}
                value={form.adminRole}
                onChange={(e) => handleAdminRoleChange(e.target.value)}
                disabled={pending}
                required
              >
                <option value="PROVINCE_ADMIN">Province Admin</option>
                <option value="CITY_ADMIN">City Admin</option>
              </select>
            </div>
          )}

          <div>
            <Label className="text-slate-900">Provinsi</Label>
            <select
              className={SELECT_CLASS}
              value={form.provinceId}
              onChange={(e) => handleProvinceChange(e.target.value)}
              disabled={provinceLocked || pending}
              required
            >
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {showCityField && (
            <div>
              <Label className="text-slate-900">Kota cabang</Label>
              <SearchableCitySelect
                key={`recruit-city-${activeProvinceId}`}
                cities={cities}
                value={selectedCityName}
                onChange={setSelectedCityName}
                disabled={pending}
                placeholder="— Ketik atau pilih kota —"
                emptyMessage="Tidak ada kota untuk provinsi ini"
                required
              />
              <p className="mt-1 text-xs text-slate-600">
                {cities.length} kota/kabupaten tersedia (data master lokal).
              </p>
            </div>
          )}

          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={pending || !canSubmitCity}
              className="gap-2 rounded-2xl"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Mail className="h-4 w-4" aria-hidden />
              )}
              Daftarkan & Kirim Email Aktivasi
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
