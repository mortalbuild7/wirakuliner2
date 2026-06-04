export const dynamic = "force-dynamic";

import { CustomerShell } from "@/components/customer/customer-shell";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
