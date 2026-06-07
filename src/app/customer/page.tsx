"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerEtalaseView } from "@/components/customer/customer-etalase-view";
import {
  CustomerExploreTabs,
  type ExploreTab,
} from "@/components/customer/customer-explore-tabs";
import { NgojekRideForm } from "@/components/customer/ngojek-ride-form";

function readTabFromUrl(): ExploreTab {
  if (typeof window === "undefined") return "etalase";
  const params = new URLSearchParams(window.location.search);
  return params.get("tab") === "ngojek" ? "ngojek" : "etalase";
}

function CustomerExploreContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ExploreTab>(readTabFromUrl);

  useEffect(() => {
    setTab(searchParams.get("tab") === "ngojek" ? "ngojek" : "etalase");
  }, [searchParams]);

  const switchTab = useCallback((next: ExploreTab) => {
    setTab(next);
    const url = next === "etalase" ? "/customer" : "/customer?tab=ngojek";
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
        <CustomerExploreTabs active={tab} onChange={switchTab} />
      </div>

      <div className="pt-4">
        {tab === "etalase" ? <CustomerEtalaseView /> : <NgojekRideForm embedded />}
      </div>
    </>
  );
}

export default function CustomerHomePage() {
  return (
    <main className="px-4 py-4">
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-16 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
          </div>
        }
      >
        <CustomerExploreContent />
      </Suspense>
    </main>
  );
}
