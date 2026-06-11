/**
 * Layout dashboard admin — memastikan kontras teks pada latar terang.
 * Route group `(admin)` tidak menambah segmen URL (/dashboard/*).
 */
export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800">{children}</div>
  );
}
