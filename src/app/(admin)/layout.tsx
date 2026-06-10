/**
 * Route group `(admin)` — isolasi modul autentikasi & dashboard admin.
 *
 * Route group TIDAK menambah segmen URL:
 * - `app/(admin)/admin/login/page.tsx`     → `/admin/login`
 * - `app/(admin)/admin/dashboard/page.tsx` → `/admin/dashboard`
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
