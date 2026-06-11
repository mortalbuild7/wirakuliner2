import { verifyAdminSession } from "@/app/utils/adminAuth";
import { regionalScopeHint } from "@/lib/admin/regional-scope";
import { INDONESIA_PROVINCES } from "@/app/utils/indonesiaProvinces";

/** Props server untuk halaman pendaftaran driver — dipakai beberapa route. */
export async function getDriverNewPageProps() {
  const session = await verifyAdminSession();

  let provinces = [...INDONESIA_PROVINCES];
  let defaultProvinceId = provinces[0]?.id ?? 1;

  if (session.adminRole === "PROVINCE_ADMIN" && session.provinceId != null) {
    provinces = provinces.filter((p) => p.id === session.provinceId);
    defaultProvinceId = session.provinceId;
  }

  if (session.adminRole === "CITY_ADMIN" && session.provinceId != null) {
    provinces = provinces.filter((p) => p.id === session.provinceId);
    defaultProvinceId = session.provinceId;
  }

  return {
    provinces,
    defaultProvinceId,
    adminTier: session.adminRole,
    scopeHint: regionalScopeHint(session),
    regionLocked: session.adminRole !== "SUPER_ADMIN",
  };
}
