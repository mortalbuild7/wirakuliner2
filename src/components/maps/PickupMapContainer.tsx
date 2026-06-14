"use client";

import { RideMapContainer, type RideMapContainerProps } from "@/components/maps/RideMapContainer";

export type PickupMapContainerProps = Omit<
  RideMapContainerProps,
  "bookingStep" | "pickupLat" | "pickupLng" | "destLat" | "destLng"
> & {
  centerLat: number;
  centerLng: number;
  hubLat: number;
  hubLng: number;
};

/** @deprecated Gunakan RideMapContainer dengan bookingStep. */
export function PickupMapContainer({
  centerLat,
  centerLng,
  hubLat,
  hubLng,
  ...rest
}: PickupMapContainerProps) {
  return (
    <RideMapContainer
      bookingStep="PICKUP"
      centerLat={centerLat}
      centerLng={centerLng}
      pickupLat={centerLat}
      pickupLng={centerLng}
      destLat={centerLng}
      destLng={centerLng}
      hubLat={hubLat}
      hubLng={hubLng}
      {...rest}
    />
  );
}
