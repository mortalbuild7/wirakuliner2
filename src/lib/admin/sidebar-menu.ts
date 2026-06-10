import type { AdminTier } from "@/app/utils/adminAuth";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  FileCheck,
  Landmark,
  Map,
  SlidersHorizontal,
  Store,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";

export type SidebarSession = {
  adminRole: AdminTier;
  provinceId: number | null;
  cityId: number | null;
  provinceName: string | null;
  cityName: string | null;
};

export type SidebarMenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Badge teks — hanya jika `badgeFor` tier cocok */
  badge?: string;
  badgeFor?: AdminTier[];
  /** Jika false, item tidak di-render sama sekali (UI masking) */
  visible: (session: SidebarSession) => boolean;
};

/**
 * Definisi menu sidebar — satu sumber kebenaran hak akses jobdesk (UI masking).
 * `visible()` dievaluasi di Server Component; client tidak menerima href terlarang.
 */
export function buildSidebarMenu(session: SidebarSession): SidebarMenuItem[] {
  const { adminRole: role } = session;

  const items: SidebarMenuItem[] = [
    {
      href: "/admin/dashboard",
      label: "Dashboard",
      icon: BarChart3,
      exact: true,
      visible: () => true,
    },
    {
      href: "/admin/dashboard/maps",
      label: "Peta Live & Lokasi Driver",
      icon: Map,
      visible: () => true,
    },
    {
      href: "/admin/drivers/verification",
      label: "Verifikasi Berkas Driver",
      icon: FileCheck,
      badge: "Aksi Aktif",
      badgeFor: ["CITY_ADMIN"],
      visible: () => true,
    },
    {
      href: "/admin/tariffs",
      label: "Ubah Tarif Per KM",
      icon: SlidersHorizontal,
      visible: () => role === "SUPER_ADMIN" || role === "PROVINCE_ADMIN",
    },
    {
      href: "/admin/recruit",
      label: "Perekrutan Admin Baru",
      icon: UserPlus,
      visible: () => role === "SUPER_ADMIN" || role === "PROVINCE_ADMIN",
    },
    {
      href: "/admin/dashboard/drivers",
      label: "Data Driver (Add/Suspend)",
      icon: Truck,
      visible: () => true,
    },
    {
      href: "/admin/dashboard/merchants",
      label: "Data Merchant (Add/Delete)",
      icon: Store,
      visible: () => true,
    },
    {
      href: "/admin/company-bank",
      label: "Data Rekening Perusahaan",
      icon: Landmark,
      visible: () => role === "SUPER_ADMIN",
    },
    {
      href: "/admin/orders",
      label: "Pesanan",
      icon: ClipboardList,
      visible: () => true,
    },
    {
      href: "/admin/customers",
      label: "Customers",
      icon: Users,
      visible: () => true,
    },
  ];

  return items.filter((item) => item.visible(session));
}
