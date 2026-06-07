import { CustomerExploreNav } from "@/components/customer/customer-explore-nav";
import { NgojekRideForm } from "@/components/customer/ngojek-ride-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CustomerRidePage() {
  return (
    <main className="px-4 py-4">
      <CustomerExploreNav active="ngojek" />
      <div className="pt-4">
        <NgojekRideForm embedded />
      </div>
    </main>
  );
}
