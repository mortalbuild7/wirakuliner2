export const dynamic = "force-dynamic";

import { CustomerShell } from "@/components/customer/customer-shell";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: "document.documentElement.classList.add('customer-app-active');",
        }}
      />
      <CustomerShell>{children}</CustomerShell>
    </>
  );
}
