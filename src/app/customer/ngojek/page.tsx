import { NgojekRideForm } from "@/components/customer/ngojek-ride-form";

export const metadata = {
  title: "NGOJEK — WIRA Kuliner",
  description: "Ojek online WIRA — jemput dan antar seperti GoRide",
};

export default function NgojekPage() {
  return (
    <main className="px-4 py-4">
      <NgojekRideForm />
    </main>
  );
}
