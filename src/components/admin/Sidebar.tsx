import { verifyAdminSession } from "@/app/utils/adminAuth";
import { buildSidebarMenu } from "@/lib/admin/sidebar-menu";
import { SidebarClient, TIER_LABEL } from "@/components/admin/sidebar-client";

/**
 * Sidebar admin dinamis — Server Component.
 *
 * Alur hak akses menu (UI masking):
 * 1. `verifyAdminSession()` — validasi JWT server-side + profiles.role + tier + MFA.
 * 2. `buildSidebarMenu()` — `visible()` per item; menu terlarang tidak dikirim ke client.
 * 3. Menu legacy (Data Driver / Data Merchant) selalu tampil untuk semua tier;
 *    pembatasan wilayah diterapkan di halaman & API, bukan di sidebar.
 * 4. Menu sensitif (Tarif, Rekrut, Rekening) disembunyikan per tier sebelum render.
 */
export async function Sidebar() {
  const session = await verifyAdminSession();

  const menu = buildSidebarMenu({
    adminRole: session.adminRole,
    provinceId: session.provinceId,
    cityId: session.cityId,
    provinceName: session.provinceName,
    cityName: session.cityName,
  });

  const scopeLabel =
    session.adminRole === "CITY_ADMIN" && session.cityName
      ? session.cityName
      : session.adminRole === "PROVINCE_ADMIN" && session.provinceName
        ? session.provinceName
        : "Seluruh Indonesia";

  const items = menu.map((item) => ({
    href: item.href,
    label: item.label,
    exact: item.exact,
    badge:
      item.badge && item.badgeFor?.includes(session.adminRole)
        ? item.badge
        : undefined,
  }));

  return (
    <SidebarClient
      items={items}
      tierLabel={TIER_LABEL[session.adminRole]}
      scopeLabel={scopeLabel}
    />
  );
}
