import { verifyAdminSession } from "@/app/utils/adminAuth";
import { buildSidebarMenu } from "@/lib/admin/sidebar-menu";
import { SidebarClient, TIER_LABEL } from "@/components/admin/sidebar-client";

/**
 * Sidebar admin dinamis — Server Component.
 *
 * Alur hak akses menu (UI masking):
 * 1. `verifyAdminSession()` memvalidasi JWT + profiles.role + tier + MFA.
 * 2. `buildSidebarMenu()` mengevaluasi `visible()` per item — item terlarang
 *    tidak pernah dikirim ke client (bukan sekadar CSS hidden).
 * 3. Badge 'Aksi Aktif' hanya disertakan untuk CITY_ADMIN pada Verifikasi Berkas.
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
