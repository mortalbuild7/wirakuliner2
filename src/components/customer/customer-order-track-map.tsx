"use client";

import dynamic from "next/dynamic";

const Inner = dynamic(
  () =>
    import("@/components/customer/customer-order-track-map-inner").then(
      (m) => m.CustomerOrderTrackMapInner
    ),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse bg-slate-900" /> }
);

type Props = {
  deliveryLat: number;
  deliveryLng: number;
  pickupLat?: number | null;
  pickupLng?: number | null;
  driverLat?: number | null;
  driverLng?: number | null;
  className?: string;
};

export function CustomerOrderTrackMap(props: Props) {
  return <Inner {...props} />;
}
