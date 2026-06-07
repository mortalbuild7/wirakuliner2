"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CustomerExploreTabs,
  type ExploreTab,
} from "@/components/customer/customer-explore-tabs";

function ExploreTabsInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const active: ExploreTab =
    searchParams.get("tab") === "ngojek" ? "ngojek" : "etalase";

  const onChange = useCallback(
    (next: ExploreTab) => {
      const url = next === "etalase" ? "/customer" : "/customer?tab=ngojek";
      router.replace(url, { scroll: false });
    },
    [router]
  );

  if (pathname !== "/customer") return null;

  return (
    <div className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-40 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
      <CustomerExploreTabs active={active} onChange={onChange} />
    </div>
  );
}

export function CustomerExploreTabsBar() {
  return (
    <Suspense fallback={null}>
      <ExploreTabsInner />
    </Suspense>
  );
}
