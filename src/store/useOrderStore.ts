"use client";

import { create } from "zustand";
import { JALAN_WIRA } from "@/lib/geo-config";
import type { GeoLocationPoint } from "@/types/geo-location";

/** Nilai awal jemput — pusat operasional WIRA (Parung Bogor). */
const DEFAULT_PICKUP: GeoLocationPoint = {
  address: "Pilih lokasi jemput di peta",
  latitude: JALAN_WIRA.latitude,
  longitude: JALAN_WIRA.longitude,
};

/** Nilai awal tujuan — sedikit offset dari hub agar peta tidak overlap. */
const DEFAULT_DEST: GeoLocationPoint = {
  address: "",
  latitude: JALAN_WIRA.latitude + 0.01,
  longitude: JALAN_WIRA.longitude + 0.01,
};

/**
 * State lokasi order transit (NGOJEK / NGOMOBIL / PAKET).
 * Memisahkan lokasi fisik HP dari lokasi jemput operasional
 * agar konsumen bisa pesan untuk orang lain.
 */
export type OrderLocationState = {
  /** Lokasi fisik HP pengguna (GPS) — referensi, tidak otomatis = jemput. */
  currentDeviceLocation: GeoLocationPoint | null;
  /** Akurasi GPS perangkat dalam meter (null jika tidak diketahui). */
  deviceAccuracyM: number | null;

  /** Lokasi jemput operasional yang dikirim ke driver. */
  pickupLocation: GeoLocationPoint;
  /** Lokasi tujuan operasional. */
  destinationLocation: GeoLocationPoint;

  /** Counter untuk memicu panTo peta jemput tanpa re-mount. */
  pickupMapFlyTrigger: number;
  /** Counter untuk memicu panTo peta tujuan. */
  destinationMapFlyTrigger: number;

  /** Simpan lokasi GPS perangkat (tidak mengubah pickup). */
  setDeviceLocation: (point: GeoLocationPoint, accuracyM?: number | null) => void;
  /** Ganti seluruh objek lokasi jemput. */
  setPickupLocation: (point: GeoLocationPoint) => void;
  /** Perbarui sebagian field lokasi jemput (mis. hanya address atau lat/lng). */
  patchPickupLocation: (patch: Partial<GeoLocationPoint>) => void;
  /** Ganti seluruh objek lokasi tujuan. */
  setDestinationLocation: (point: GeoLocationPoint) => void;
  /** Perbarui sebagian field lokasi tujuan. */
  patchDestinationLocation: (patch: Partial<GeoLocationPoint>) => void;
  /** Salin currentDeviceLocation → pickupLocation + fly peta. */
  applyDeviceLocationToPickup: () => void;
  /** Naikkan counter agar PickupMapContainer pan ke pickupLocation. */
  bumpPickupMapFly: () => void;
  /** Naikkan counter agar peta tujuan pan ke destinationLocation. */
  bumpDestinationMapFly: () => void;
};

/** Store Zustand global — satu sumber kebenaran lokasi order di halaman ride. */
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
