"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { hasAccountWarning } from "@/lib/account-status";

export function CustomerModerationBanner() {
  const [warning, setWarning] = useState<{ note: string | null } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("account_status, admin_note")
        .eq("id", user.id)
        .maybeSingle();
      if (data && hasAccountWarning(data)) {
        setWarning({ note: data.admin_note ?? null });
      }
    });
  }, []);

  if (!warning) return null;

  return (
    <Alert variant="warning" className="mx-4 mt-3 max-w-mobile rounded-xl">
      <strong>Peringatan dari admin</strong>
      <p className="mt-1 text-sm">
        {warning.note ?? "Perilaku akun Anda perlu diperbaiki. Pelanggaran berikutnya dapat berakibat suspend."}
      </p>
    </Alert>
  );
}
