"use client";

import { CapacitorBridge } from "@/components/driver/capacitor-bridge";
import { DriverNativeBridge } from "@/components/driver/driver-native-bridge";

export function DriverBridges() {
  return (
    <>
      <CapacitorBridge />
      <DriverNativeBridge />
    </>
  );
}
