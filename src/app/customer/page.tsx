import { CustomerEtalaseView } from "@/components/customer/customer-etalase-view";
import { CustomerExploreNav } from "@/components/customer/customer-explore-nav";
import { CustomerActiveOrdersPanel } from "@/components/customer/customer-active-orders-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CustomerHomePage() {
  return (
    <main className="px-4 py-4">
      <CustomerExploreNav active="etalase" />
      <div className="space-y-4 pt-4">
        <CustomerActiveOrdersPanel />
        <CustomerEtalaseView />
      </div>
    </main>
  );
}
