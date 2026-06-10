import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Halaman ditampilkan saat `assertSuperAdminPage()` atau API mengembalikan 403. */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <ShieldOff className="h-10 w-10 text-destructive" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold">Akses Ditolak</h1>
        <p className="text-muted-foreground">
          Anda tidak memiliki hak admin untuk mengakses wilayah ini. Customer dan
          driver tidak dapat membuka URL panel admin secara manual. Status role
          diverifikasi di server — manipulasi dari browser tidak berpengaruh.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/">Beranda</Link>
        </Button>
        <Button asChild>
          <Link href="/admin/login">Login Admin</Link>
        </Button>
      </div>
    </div>
  );
}
