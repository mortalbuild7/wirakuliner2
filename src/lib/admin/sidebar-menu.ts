import type { AdminTier } from "@/app/utils/adminAuth";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardList,
  FileCheck,
  Landmark,
  Map,
  MapPinned,
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

/** Judul seksi non-klik — pemisah visual grup menu operasional. */
export type SidebarMenuSection = {
  kind: "section";
  label: string;
  visible: (session: SidebarSession) => boolean;
};

/** Entri sidebar: link navigasi atau judul seksi. */
export type SidebarMenuEntry =
  | ({ kind: "item" } & SidebarMenuItem)
  | SidebarMenuSection;

/**
 * Definisi menu sidebar — satu sumber kebenaran hak akses jobdesk (UI masking).
 * `visible()` dievaluasi di Server Component; client tidak menerima href terlarang.
 */
export function buildSidebarMenu(session: SidebarSession): SidebarMenuEntry[] {
  const { adminRole: role } = session;

  const entries: SidebarMenuEntry[] = [
    { kind: "item",
      href: "/admin",
      label: "Dashboard",
      icon: BarChart3,
      exact: true,
      visible: () => true,
    },
    { kind: "item",
      href: "/admin/maps",
      label: "Peta Live & Lokasi Driver",
      icon: Map,
      visible: () => true,
    },
    { kind: "item",
      href: "/admin/drivers/verification",
      label: "Verifikasi Berkas Driver",
      icon: FileCheck,
      badge: "Aksi Aktif",
      badgeFor: ["CITY_ADMIN"],
      visible: () => true,
    },
    { kind: "item",
      href: "/admin/tariffs",
      label: "Ubah Tarif Per KM",
      icon: SlidersHorizontal,
      visible: () => role === "SUPER_ADMIN" || role === "PROVINCE_ADMIN",
    },
    { kind: "item",
      href: "/admin/recruit",
      label: "Perekrutan Admin Baru",
      icon: UserPlus,
      visible: () => role === "SUPER_ADMIN" || role === "PROVINCE_ADMIN",
    },
    { kind: "item",
      href: "/admin/drivers",
      label: "Data Driver (Add/Suspend)",
      icon: Truck,
      visible: () => true,
    },
    { kind: "item",
      href: "/admin/merchants",
      label: "Data Merchant (Add/Delete)",
      icon: Store,
      visible: () => true,
    },
    // ── Seksi Operasional Wilayah — pemisah visual grup menu regional. ───────
    {
      kind: "section",
      label: "Operasional Wilayah",
      visible: () => true,
    },
    // Manajemen Kota: UI masking SUPER_ADMIN — href tidak dikirim ke client lain.
    { kind: "item",
      href: "/admin/dashboard/cities",
      label: "🗺️ Manajemen Kota",
      icon: MapPinned,
      visible: () => role === "SUPER_ADMIN",
    },
    { kind: "item",
      href: "/admin/company-bank",
      label: "Data Rekening Perusahaan",
      icon: Landmark,
      visible: () => role === "SUPER_ADMIN",
    },
    { kind: "item",
      href: "/admin/orders",
      label: "Pesanan",
      icon: ClipboardList,
      visible: () => true,
    },
    { kind: "item",
      href: "/admin/customers",
      label: "Customers",
      icon: Users,
      visible: () => true,
    },
  ];

  return entries.filter((entry) =>
    entry.kind === "section" ? entry.visible(session) : entry.visible(session)
  );
}
