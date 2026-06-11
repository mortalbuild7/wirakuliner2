import { AdminActivateForm } from "@/components/admin/admin-activate-form";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

/** URL: /admin/activate?token=... — halaman publik (tanpa sidebar) untuk aktivasi admin. */
export default async function AdminActivatePage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-slate-800">
      <div className="mb-6 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-2 text-2xl font-bold text-slate-900">WIRA Admin</h1>
        <p className="mt-1 text-sm text-slate-600">Aktivasi akun keamanan regional</p>
      </div>
      <AdminActivateForm token={token} />
    </main>
  );
}
