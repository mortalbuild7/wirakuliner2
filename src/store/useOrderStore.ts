"use client";

import { create } from "zustand";
import { JALAN_WIRA } from "@/lib/geo-config";
import type { GeoLocationPoint } from "@/types/geo-location";

const DEFAULT_PICKUP: GeoLocationPoint = {
  address: "Pilih lokasi jemput di peta",
  latitude: JALAN_WIRA.latitude,
  longitude: JALAN_WIRA.longitude,
};

const DEFAULT_DEST: GeoLocationPoint = {
  address: "",
  latitude: JALAN_WIRA.latitude + 0.01,
  longitude: JALAN_WIRA.longitude + 0.01,
};

export type OrderLocationState = {
  /** Lokasi fisik HP pengguna (GPS) — referensi, tidak otomatis = jemput. */
  currentDeviceLocation: GeoLocationPoint | null;
  deviceAccuracyM: number | null;

  /** Lokasi jemput operasional yang dikirim ke driver. */
  pickupLocation: GeoLocationPoint;
  destinationLocation: GeoLocationPoint;

  pickupMapFlyTrigger: number;
  destinationMapFlyTrigger: number;

  setDeviceLocation: (point: GeoLocationPoint, accuracyM?: number | null) => void;
  setPickupLocation: (point: GeoLocationPoint) => void;
  patchPickupLocation: (patch: Partial<GeoLocationPoint>) => void;
  setDestinationLocation: (point: GeoLocationPoint) => void;
  patchDestinationLocation: (patch: Partial<GeoLocationPoint>) => void;
  applyDeviceLocationToPickup: () => void;
  bumpPickupMapFly: () => void;
  bumpDestinationMapFly: () => void;
};

export const useOrderStore = create<OrderLocationState>((set, get) => ({
  currentDeviceLocation: null,
  deviceAccuracyM: null,
  pickupLocation: { ...DEFAULT_PICKUP },
  destinationLocation: { ...DEFAULT_DEST },
  pickupMapFlyTrigger: 0,
  destinationMapFlyTrigger: 0,

  setDeviceLocation: (point, accuracyM = null) =>
    set({ currentDeviceLocation: point, deviceAccuracyM: accuracyM ?? null }),

  setPickupLocation: (point) => set({ pickupLocation: point }),

  patchPickupLocation: (patch) =>
    set((s) => ({
      pickupLocation: { ...s.pickupLocation, ...patch },
    })),

  setDestinationLocation: (point) => set({ destinationLocation: point }),

  patchDestinationLocation: (patch) =>
    set((s) => ({
      destinationLocation: { ...s.destinationLocation, ...patch },
    })),

  applyDeviceLocationToPickup: () => {
    const device = get().currentDeviceLocation;
    if (!device) return;
    set({
      pickupLocation: { ...device },
      pickupMapFlyTrigger: get().pickupMapFlyTrigger + 1,
    });
  },

  bumpPickupMapFly: () =>
    set((s) => ({ pickupMapFlyTrigger: s.pickupMapFlyTrigger + 1 })),

  bumpDestinationMapFly: () =>
    set((s) => ({ destinationMapFlyTrigger: s.destinationMapFlyTrigger + 1 })),
}));
