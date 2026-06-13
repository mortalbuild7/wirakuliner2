"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { deleteServiceCity } from "@/app/actions/cityActions";

export type ServiceCityTableRow = {
  id: string;
  name: string;
  slug: string;
  province_id: number | null;
  city_id: number | null;
  radius_km: number;
  is_active: boolean;
  provinces?: { name: string } | { name: string }[] | null;
};

function provinceLabel(row: ServiceCityTableRow): string {
  const p = row.provinces;
  if (Array.isArray(p)) return p[0]?.name ?? "—";
  return p?.name ?? "—";
}

export function ServiceCitiesTable({
  cities,
  onCitiesChange,
}: {
  cities: ServiceCityTableRow[];
  onCitiesChange: (next: ServiceCityTableRow[]) => void;
}) {
  const router = useRouter();
  const [deletePending, startDeleteTransition] = useTransition();

  function handleDelete(row: ServiceCityTableRow) {
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus ${row.name} dari zona operasi aktif?`
    );
    if (!confirmed) return;

    startDeleteTransition(async () => {
      const res = await deleteServiceCity(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(res.message);
      onCitiesChange(cities.filter((c) => c.id !== row.id));
      router.refresh();
    });
  }

  if (cities.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-700">
        Belum ada kota layanan. Tambahkan kota pertama menggunakan form di atas.
      </p>
    );
  }

  return (
    <div className="wira-table-wrap mt-4 min-w-[760px] overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-slate-900">Nama Zona</th>
            <th className="px-4 py-3 text-left text-slate-900">Provinsi</th>
            <th className="px-4 py-3 text-left text-slate-900">Kode Kota</th>
            <th className="px-4 py-3 text-left text-slate-900">Radius</th>
            <th className="px-4 py-3 text-left text-slate-900">Status</th>
            <th className="px-4 py-3 text-right text-slate-900">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {cities.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
              <td className="px-4 py-3 text-slate-700">{provinceLabel(c)}</td>
              <td className="px-4 py-3 text-xs text-slate-600">
                P{c.province_id ?? "—"} / K{c.city_id ?? "—"}
              </td>
              <td className="px-4 py-3 text-slate-800">{c.radius_km} km</td>
              <td className="px-4 py-3">
                <span
                  className={
                    c.is_active
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-red-700"
                  }
                >
                  {c.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleDelete(c)}
                  disabled={deletePending}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                  aria-label={`Hapus ${c.name}`}
                  title="Hapus kota layanan"
                >
                  {deletePending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden />
                  )}
                  <span className="text-xs font-bold">Hapus</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
