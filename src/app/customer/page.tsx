"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerEtalaseView } from "@/components/customer/customer-etalase-view";
import { NgojekRideForm } from "@/components/customer/ngojek-ride-form";
import type { ExploreTab } from "@/components/customer/customer-explore-tabs";

function CustomerExploreContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ExploreTab>(() =>
    searchParams.get("tab") === "ngojek" ? "ngojek" : "etalase"
  );

  useEffect(() => {
    setTab(searchParams.get("tab") === "ngojek" ? "ngojek" : "etalase");
  }, [searchParams]);

  return (
    <main className="px-4 py-4">
      {tab === "etalase" ? <CustomerEtalaseView /> : <NgojekRideForm embedded />}
    </main>
  );
}

export default function CustomerHomePage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-4">
          <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
        </main>
      }
    >
      <CustomerExploreContent />
    </Suspense>
  );
}
