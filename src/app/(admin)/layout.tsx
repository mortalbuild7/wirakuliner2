/**
 * Route group `(admin)` — isolasi modul autentikasi & dashboard admin.
 *
 * Route group TIDAK menambah segmen URL:
 * - `app/(admin)/admin/login/page.tsx`        → `/admin/login`
 * - `app/admin/page.tsx`                      → `/admin`
 * - `app/admin/drivers/page.tsx`              → `/admin/drivers`
 * - `app/admin/merchants/page.tsx`            → `/admin/merchants`
 *
 * Satu pintu login resmi admin; setelah MFA, middleware + verifyAdminSession
 * mengarahkan ke dashboard sesuai tier (SUPER / PROVINCE / CITY).
 */
export default function AdminRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
