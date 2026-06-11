"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  recruitNewAdmin,
  type RecruitAdminInput,
} from "@/app/actions/adminRecruitActions";
import {
  getActiveCitiesByProvince,
  type ActiveCityOption,
} from "@/app/actions/locationActions";
import type { IndonesiaProvince } from "@/app/utils/indonesiaProvinces";
import type { AdminTier } from "@/app/utils/adminAuth";
import { Loader2, Mail, UserPlus } from "lucide-react";

const SELECT_CLASS =
  "mt-1 flex h-11 w-full rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-sm text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60";

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
    cityId: "",
  });

  const [cities, setCities] = useState<ActiveCityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const showCityField = form.adminRole === "CITY_ADMIN";

  useEffect(() => {
    if (!showCityField) {
      setCities([]);
      setForm((f) => ({ ...f, cityId: "" }));
      return;
    }

    const pid = Number(form.provinceId);
    if (!Number.isInteger(pid) || pid <= 0) return;

    let cancelled = false;
    setCitiesLoading(true);

    void getActiveCitiesByProvince(pid).then((res) => {
      if (cancelled) return;
      setCitiesLoading(false);
      if (!res.ok) {
        setCities([]);
        return;
      }
      setCities(res.cities);
      setForm((f) => ({
        ...f,
        cityId: res.cities.length === 1 ? String(res.cities[0].cityId) : "",
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [form.provinceId, showCityField]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload: RecruitAdminInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      adminRole: form.adminRole as "PROVINCE_ADMIN" | "CITY_ADMIN",
      provinceId: Number(form.provinceId),
      cityId: showCityField ? Number(form.cityId) : undefined,
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
        cityId: "",
      }));
    });
  }

  return (
    <Card className="mt-6 max-w-2xl border-emerald-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-slate-800">
          <UserPlus className="h-5 w-5 text-emerald-600" />
          Form Rekrutmen Admin
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            {error}
          </Alert>
        )}
        {success && (
          <Alert className="mb-4 border-emerald-500/40 bg-emerald-50 text-emerald-900">
            <Mail className="h-4 w-4 shrink-0" />
            {success}
          </Alert>
        )}

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nama lengkap</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
              disabled={pending}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Email korporat</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="nama@wirakuliner.web.id"
              required
              disabled={pending}
            />
            <p className="mt-1 text-xs text-slate-500">
              Email aktivasi & instruksi MFA dikirim otomatis dari{" "}
              <strong>admin@wirakuliner.web.id</strong>.
            </p>
          </div>

          {recruiterTier === "SUPER_ADMIN" && (
            <div className="sm:col-span-2">
              <Label>Tier admin</Label>
              <select
                className={SELECT_CLASS}
                value={form.adminRole}
                onChange={(e) =>
                  setForm({ ...form, adminRole: e.target.value, cityId: "" })
                }
                disabled={pending}
              >
                <option value="PROVINCE_ADMIN">Province Admin</option>
                <option value="CITY_ADMIN">City Admin</option>
              </select>
            </div>
          )}

          <div>
            <Label>Provinsi</Label>
            <select
              className={SELECT_CLASS}
              value={form.provinceId}
              onChange={(e) =>
                setForm({ ...form, provinceId: e.target.value, cityId: "" })
              }
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
              <Label>Kota cabang</Label>
              <select
                className={SELECT_CLASS}
                value={form.cityId}
                onChange={(e) => setForm({ ...form, cityId: e.target.value })}
                disabled={pending || citiesLoading || cities.length === 0}
                required
              >
                <option value="">
                  {citiesLoading ? "Memuat…" : "— Pilih kota —"}
                </option>
                {cities.map((c) => (
                  <option key={c.cityId} value={c.cityId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={
                pending ||
                (showCityField && (!form.cityId || cities.length === 0))
              }
              className="gap-2"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Daftarkan & Kirim Email Aktivasi
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
