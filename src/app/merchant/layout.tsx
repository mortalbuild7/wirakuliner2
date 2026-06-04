export const dynamic = "force-dynamic";

import { MerchantShell } from "@/components/merchant/merchant-shell";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return <MerchantShell>{children}</MerchantShell>;
}
