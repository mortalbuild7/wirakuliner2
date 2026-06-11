"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getAddressFromCoordinates } from "@/app/actions/geoActions";
import type { GeocodeHit } from "@/lib/geocode";
import { haversineKm } from "@/lib/geo-config";
import { useOrderStore } from "@/store/useOrderStore";
import type { GeoLocationPoint } from "@/types/geo-location";
import {
  buildPlaceRidePayload,
  packageNeedsCargoVehicle,
  packageVolumeCm3,
  validateTransitBooking,
  type PackageDetailsInput,
} from "@/lib/ngojek-ride-logic";
import { formatTransitAddressByService } from "@/lib/order-channel";
import {
  createQrisPayment,
  isPaymentBypassEnabled,
} from "@/lib/payment-flow";
import {
  PAKET_CARGO_VOLUME_THRESHOLD_CM3,
  SERVICE_TYPE_LABEL,
  type ServiceType,
} from "@/lib/service-types";
import type { QrisPaymentData } from "@/components/payment/qris-payment-panel";
import type { PaymentMethodChoice } from "@/components/wallet/payment-method-picker";
import { createClient } from "@/lib/supabase/client";

const REVERSE_MIN_KM = 0.025;
/** Perubahan koordinat di bawah ini dianggap sama (hindari jitter GPS / geocode). */
const COORD_QUOTE_MIN_MOVE_KM = 0.03;
const PICKUP_QUOTE_MIN_MOVE_KM = COORD_QUOTE_MIN_MOVE_KM;
const QUOTE_DEBOUNCE_MS = 500;
const QUOTE_FETCH_TIMEOUT_MS = 10_000;
const QUOTE_SPIN_DELAY_MS = 400;

/** Bulatkan koordinat ~1 m agar perubahan mikro tidak memicu ulang kalkulasi. */
function roundCoordForQuote(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function buildQuoteKey(
  pickupLat: number,
  pickupLng: number,
  destLat: number,
  destLng: number,
  serviceType: ServiceType
): string {
  return [
    roundCoordForQuote(pickupLat),
    roundCoordForQuote(pickupLng),
    roundCoordForQuote(destLat),
    roundCoordForQuote(destLng),
    serviceType,
  ].join("|");
}

function parseQuoteKey(key: string) {
  const [pickupLat, pickupLng, destLat, destLng, serviceType] = key.split("|");
  return {
    pickupLat: Number(pickupLat),
    pickupLng: Number(pickupLng),
    destLat: Number(destLat),
    destLng: Number(destLng),
    serviceType: serviceType as ServiceType,
  };
}

function transitQuoteFallback(serviceType: ServiceType, distanceKm: number) {
  const defaults: Record<ServiceType, { base: number; perKm: number }> = {
    NGOJEK: { base: 10_000, perKm: 2_000 },
    NGOMOBIL: { base: 15_000, perKm: 2_700 },
    PAKET: { base: 12_000, perKm: 2_300 },
  };
  const { base, perKm } = defaults[serviceType];
  const km = Math.max(0, distanceKm);
  return {
    rideFee: Math.round(base + perKm * km),
    feeDescription: `Rp ${base.toLocaleString("id-ID")} + Rp ${perKm.toLocaleString("id-ID")}/km × ${km.toFixed(2)} km`,
  };
}

const EMPTY_PACKAGE: PackageDetailsInput = {
  senderName: "",
  senderPhone: "",
  recipientName: "",
  recipientPhone: "",
  packageType: "Dokumen",
  weightKg: 1,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

async function fetchServiceArea(lat: number, lng: number) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/service-area/check?${params}`);
  if (!res.ok) return null;
  return (await res.json()) as {
    available?: boolean;
    message?: string | null;
    cityId?: string | null;
  };
}

async function reverseGeocode(lat: number, lng: number): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    reverse: "1",
    lat: String(lat),
    lng: String(lng),
  });
  const res = await fetch(`/api/geocode?${params.toString()}`);
  if (res.status === 429 || !res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { results?: GeocodeHit[] };
  return json.results?.[0] ?? null;
}

/** State & logika bisnis transit (NGOJEK / NGOMOBIL / PAKET). */
export function useNgojekRide() {
  const router = useRouter();
  const supabase = createClient();

  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("NGOJEK");
  const [packageDetails, setPackageDetails] =
    useState<PackageDetailsInput>(EMPTY_PACKAGE);

  const pickupLocation = useOrderStore((s) => s.pickupLocation);
  const destinationLocation = useOrderStore((s) => s.destinationLocation);
  const currentDeviceLocation = useOrderStore((s) => s.currentDeviceLocation);
  const deviceAccuracyM = useOrderStore((s) => s.deviceAccuracyM);
  const pickupMapFlyTrigger = useOrderStore((s) => s.pickupMapFlyTrigger);
  const destinationMapFlyTrigger = useOrderStore((s) => s.destinationMapFlyTrigger);
  const setDeviceLocation = useOrderStore((s) => s.setDeviceLocation);
  const patchPickupLocation = useOrderStore((s) => s.patchPickupLocation);
  const setPickupLocation = useOrderStore((s) => s.setPickupLocation);
  const patchDestinationLocation = useOrderStore((s) => s.patchDestinationLocation);
  const setDestinationLocation = useOrderStore((s) => s.setDestinationLocation);
  const applyDeviceLocationToPickup = useOrderStore((s) => s.applyDeviceLocationToPickup);
  const bumpDestinationMapFly = useOrderStore((s) => s.bumpDestinationMapFly);
  const bumpPickupMapFly = useOrderStore((s) => s.bumpPickupMapFly);

  const pickupAddress = pickupLocation.address;
  const pickupLat = pickupLocation.latitude;
  const pickupLng = pickupLocation.longitude;
  const destAddress = destinationLocation.address;
  const destLat = destinationLocation.latitude;
  const destLng = destinationLocation.longitude;
  const mapFlyTrigger = destinationMapFlyTrigger;

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice>("gateway");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [qrisPayment, setQrisPayment] = useState<QrisPaymentData | null>(null);

  const [pickupAreaOk, setPickupAreaOk] = useState(true);
  const [destAreaOk, setDestAreaOk] = useState(true);
  const [sameCityOk, setSameCityOk] = useState(true);
  const [areaMessage, setAreaMessage] = useState<string | null>(null);

  const [destSuggestions, setDestSuggestions] = useState<GeocodeHit[]>([]);
  const [geocodingDest, setGeocodingDest] = useState(false);

  const [distanceKm, setDistanceKm] = useState(0);
  const [rideFee, setRideFee] = useState(0);
  const [feeDescription, setFeeDescription] = useState("");
  const [quoting, setQuoting] = useState(false);

  const skipForwardGeocodeRef = useRef(false);
  const destFromPinRef = useRef(false);
  const forwardGeocodeGenRef = useRef(0);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupReverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickupReverseGenRef = useRef(0);
  const lastReverseCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastForwardQueryRef = useRef("");
  const pickupGeoRef = useRef({ lat: pickupLat, lng: pickupLng });
  pickupGeoRef.current = { lat: pickupLat, lng: pickupLng };
  const destGeoRef = useRef({ lat: destLat, lng: destLng });
  destGeoRef.current = { lat: destLat, lng: destLng };
  const quoteGenRef = useRef(0);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const lastServerQuoteKeyRef = useRef("");
  const [gpsLoading, setGpsLoading] = useState(false);

  const quoteKey = useMemo(
    () => buildQuoteKey(pickupLat, pickupLng, destLat, destLng, serviceType),
    [pickupLat, pickupLng, destLat, destLng, serviceType]
  );

  const areaAvailable = pickupAreaOk && destAreaOk && sameCityOk;

  const packageVolume = useMemo(() => {
    if (serviceType !== "PAKET") return 0;
    return packageVolumeCm3(packageDetails);
  }, [serviceType, packageDetails]);

  const needsCargoVehicle = useMemo(() => {
    if (serviceType !== "PAKET") return false;
    return packageNeedsCargoVehicle(packageDetails);
  }, [serviceType, packageDetails]);

  const serviceLabel = SERVICE_TYPE_LABEL[serviceType];

  const updatePackageField = useCallback(
    <K extends keyof PackageDetailsInput>(key: K, value: PackageDetailsInput[K]) => {
      setPackageDetails((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setAuthReady(true);
    });
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/wallet/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { balance?: number } | null) => {
        if (j && typeof j.balance === "number") setWalletBalance(j.balance);
      })
      .catch(() => {});
  }, [userId]);

  /** Tarif lokal instan + refresh server di background (tanpa spinner menggantung). */
  useEffect(() => {
    const coords = parseQuoteKey(quoteKey);
    const km = haversineKm(
      coords.pickupLat,
      coords.pickupLng,
      coords.destLat,
      coords.destLng
    );
    const local = transitQuoteFallback(coords.serviceType, km);

    setDistanceKm(km);
    setRideFee(local.rideFee);
    setFeeDescription(local.feeDescription);
    setQuoting(false);

    if (quoteKey === lastServerQuoteKeyRef.current) return;

    const gen = ++quoteGenRef.current;
    quoteAbortRef.current?.abort();

    const spinTimer = setTimeout(() => {
      if (gen === quoteGenRef.current) setQuoting(true);
    }, QUOTE_SPIN_DELAY_MS);

    const fetchTimer = setTimeout(() => {
      void (async () => {
        if (gen !== quoteGenRef.current) return;

        const controller = new AbortController();
        quoteAbortRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), QUOTE_FETCH_TIMEOUT_MS);

        try {
          const res = await fetch("/api/orders/quote-transit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            signal: controller.signal,
            body: JSON.stringify({
              pickupLat: coords.pickupLat,
              pickupLng: coords.pickupLng,
              destinationLat: coords.destLat,
              destinationLng: coords.destLng,
              serviceType: coords.serviceType,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            distanceKm?: number;
            rideFee?: number;
            feeDescription?: string;
            areaAvailable?: boolean;
            areaMessage?: string;
            tooClose?: boolean;
            tooFar?: boolean;
          };
          if (gen !== quoteGenRef.current || controller.signal.aborted) return;

          if (!res.ok) {
            setFeeDescription(json.error ?? local.feeDescription);
            return;
          }

          lastServerQuoteKeyRef.current = quoteKey;
          setDistanceKm(Number(json.distanceKm ?? km));
          if (json.tooClose || json.tooFar || json.rideFee === 0) {
            setRideFee(0);
          } else {
            setRideFee(Number(json.rideFee ?? local.rideFee));
          }
          setFeeDescription(json.feeDescription ?? local.feeDescription);
          if (json.areaAvailable === false && json.areaMessage) {
            setAreaMessage(json.areaMessage);
          }
        } catch {
          if (gen !== quoteGenRef.current || controller.signal.aborted) return;
          setFeeDescription(`${local.feeDescription} (estimasi lokal)`);
        } finally {
          clearTimeout(timeoutId);
          if (gen === quoteGenRef.current) setQuoting(false);
        }
      })();
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      clearTimeout(spinTimer);
      clearTimeout(fetchTimer);
      quoteAbortRef.current?.abort();
      setQuoting(false);
    };
  }, [quoteKey]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [pickup, dest] = await Promise.all([
        fetchServiceArea(pickupLat, pickupLng),
        fetchServiceArea(destLat, destLng),
      ]);
      if (cancelled) return;

      const pickupOk = pickup?.available !== false;
      const destOk = dest?.available !== false;
      const sameCity =
        !pickup?.cityId || !dest?.cityId || pickup.cityId === dest.cityId;

      setPickupAreaOk(pickupOk);
      setDestAreaOk(destOk);
      setSameCityOk(sameCity);

      if (!pickupOk) {
        setAreaMessage(pickup?.message ?? "Jemput di luar wilayah layanan");
      } else if (!destOk) {
        setAreaMessage("Tujuan di luar wilayah layanan");
      } else if (!sameCity) {
        setAreaMessage("Jemput dan tujuan harus dalam kota layanan yang sama");
      } else {
        setAreaMessage(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pickupLat, pickupLng, destLat, destLng]);

  /** GPS sekali — hanya mengisi currentDeviceLocation, tidak mengunci pickup. */
  useEffect(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = roundCoordForQuote(pos.coords.latitude);
        const lng = roundCoordForQuote(pos.coords.longitude);
        setGpsLoading(false);
        void (async () => {
          const res = await getAddressFromCoordinates(lat, lng);
          const address =
            res.ok && res.location.address
              ? res.location.address
              : "Lokasi perangkat saya";
          setDeviceLocation(
            { address, latitude: lat, longitude: lng },
            pos.coords.accuracy
          );
        })();
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  }, [setDeviceLocation]);

  const applyDestinationCoords = useCallback((lat: number, lng: number, fly = true) => {
    const roundedLat = roundCoordForQuote(lat);
    const roundedLng = roundCoordForQuote(lng);
    const movedKm = haversineKm(
      destGeoRef.current.lat,
      destGeoRef.current.lng,
      roundedLat,
      roundedLng
    );
    if (movedKm < COORD_QUOTE_MIN_MOVE_KM) return;

    patchDestinationLocation({ latitude: roundedLat, longitude: roundedLng });
    if (fly) bumpDestinationMapFly();
  }, [patchDestinationLocation, bumpDestinationMapFly]);

  const applyDestinationHit = useCallback(
    (hit: GeocodeHit) => {
      forwardGeocodeGenRef.current += 1;
      destFromPinRef.current = true;
      skipForwardGeocodeRef.current = true;
      patchDestinationLocation({
        address: hit.label,
        latitude: hit.lat,
        longitude: hit.lng,
      });
      applyDestinationCoords(hit.lat, hit.lng);
      setDestSuggestions([]);
    },
    [applyDestinationCoords, patchDestinationLocation]
  );

  const reverseGeocodeDest = useCallback(async (lat: number, lng: number) => {
    const hit = await reverseGeocode(lat, lng);
    if (hit) {
      destFromPinRef.current = true;
      skipForwardGeocodeRef.current = true;
      patchDestinationLocation({ address: hit.label });
      lastReverseCoordsRef.current = { lat, lng };
    }
  }, [patchDestinationLocation]);

  useEffect(() => {
    if (destFromPinRef.current) {
      destFromPinRef.current = false;
      return;
    }
    if (skipForwardGeocodeRef.current) {
      skipForwardGeocodeRef.current = false;
      return;
    }

    const q = destAddress.trim();
    if (q.length < 3) {
      setDestSuggestions([]);
      lastForwardQueryRef.current = "";
      return;
    }
    if (q === lastForwardQueryRef.current) return;

    const gen = ++forwardGeocodeGenRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        if (gen !== forwardGeocodeGenRef.current || destFromPinRef.current) return;

        setGeocodingDest(true);
        setPlaceError(null);
        try {
          const params = new URLSearchParams({ q });
          params.set("nearLat", String(pickupGeoRef.current.lat));
          params.set("nearLng", String(pickupGeoRef.current.lng));
          const res = await fetch(`/api/geocode?${params.toString()}`);
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            results?: GeocodeHit[];
          };
          if (gen !== forwardGeocodeGenRef.current || destFromPinRef.current) return;

          if (!res.ok) {
            if (res.status === 429) {
              setPlaceError(
                "Pencarian sibuk — pin sudah di peta, geser pin atau coba lagi sebentar"
              );
            } else if (json.error) {
              setPlaceError(json.error);
            }
            setDestSuggestions([]);
            return;
          }

          const results = json.results ?? [];
          if (results.length === 0) {
            setDestSuggestions([]);
            setPlaceError("Alamat tidak ditemukan — coba kata kunci lain atau geser pin");
            return;
          }

          lastForwardQueryRef.current = q;
          applyDestinationCoords(results[0].lat, results[0].lng);
          setDestSuggestions(results.length > 1 ? results : []);
        } catch {
          if (gen === forwardGeocodeGenRef.current) {
            setPlaceError("Gagal mencari alamat. Periksa koneksi internet.");
          }
        } finally {
          if (gen === forwardGeocodeGenRef.current) setGeocodingDest(false);
        }
      })();
    }, 1000);

    return () => clearTimeout(timer);
  }, [destAddress, applyDestinationCoords]);

  const handleDestMapChange = useCallback(
    (lat: number, lng: number) => {
      forwardGeocodeGenRef.current += 1;
      destFromPinRef.current = true;
      skipForwardGeocodeRef.current = true;
      applyDestinationCoords(lat, lng, false);
      setDestSuggestions([]);
      setGeocodingDest(false);
      setPlaceError(null);

      const last = lastReverseCoordsRef.current;
      if (last && haversineKm(last.lat, last.lng, lat, lng) < REVERSE_MIN_KM) return;

      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      reverseTimerRef.current = setTimeout(() => {
        void reverseGeocodeDest(lat, lng);
      }, 1500);
    },
    [applyDestinationCoords, reverseGeocodeDest]
  );

  useEffect(() => {
    return () => {
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      if (pickupReverseTimerRef.current) clearTimeout(pickupReverseTimerRef.current);
    };
  }, []);

  const refreshPickupGps = useCallback(() => {
    if (!navigator.geolocation) {
      setPlaceError("GPS tidak tersedia di perangkat ini");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = roundCoordForQuote(pos.coords.latitude);
        const lng = roundCoordForQuote(pos.coords.longitude);
        setPlaceError(null);
        setGpsLoading(false);
        void (async () => {
          const res = await getAddressFromCoordinates(lat, lng);
          const address =
            res.ok && res.location.address
              ? res.location.address
              : "Lokasi perangkat saya";
          setDeviceLocation(
            { address, latitude: lat, longitude: lng },
            pos.coords.accuracy
          );
        })();
      },
      () => {
        setGpsLoading(false);
        setPlaceError("Gagal mengambil lokasi GPS. Izinkan akses lokasi.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    );
  }, [setDeviceLocation]);

  const applyPickupFromDevice = useCallback(() => {
    if (!currentDeviceLocation) {
      setPlaceError("Lokasi perangkat belum tersedia — izinkan GPS");
      return;
    }
    applyDeviceLocationToPickup();
    setPlaceError(null);
  }, [currentDeviceLocation, applyDeviceLocationToPickup]);

  const onDestAddressChange = useCallback((value: string) => {
    destFromPinRef.current = false;
    lastForwardQueryRef.current = "";
    setPlaceError(null);
    patchDestinationLocation({ address: value });
  }, [patchDestinationLocation]);

  const reverseGeocodePickup = useCallback(async (lat: number, lng: number) => {
    const gen = ++pickupReverseGenRef.current;
    const res = await getAddressFromCoordinates(lat, lng);
    if (gen !== pickupReverseGenRef.current) return;
    if (res.ok) {
      patchPickupLocation({
        address: res.location.address,
        latitude: res.location.latitude,
        longitude: res.location.longitude,
      });
    } else {
      patchPickupLocation({
        latitude: lat,
        longitude: lng,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      });
    }
  }, [patchPickupLocation]);

  const handlePickupMapIdle = useCallback(
    (lat: number, lng: number) => {
      const roundedLat = roundCoordForQuote(lat);
      const roundedLng = roundCoordForQuote(lng);
      const movedKm = haversineKm(
        pickupGeoRef.current.lat,
        pickupGeoRef.current.lng,
        roundedLat,
        roundedLng
      );
      if (movedKm < PICKUP_QUOTE_MIN_MOVE_KM) return;

      patchPickupLocation({ latitude: roundedLat, longitude: roundedLng });

      if (pickupReverseTimerRef.current) clearTimeout(pickupReverseTimerRef.current);
      pickupReverseTimerRef.current = setTimeout(() => {
        void reverseGeocodePickup(roundedLat, roundedLng);
      }, 600);
    },
    [patchPickupLocation, reverseGeocodePickup]
  );

  const handlePickupSearchSelect = useCallback(
    (loc: GeoLocationPoint) => {
      setPickupLocation(loc);
      bumpPickupMapFly();
    },
    [setPickupLocation, bumpPickupMapFly]
  );

  const onPickupAddressChange = useCallback(
    (value: string) => {
      patchPickupLocation({ address: value });
    },
    [patchPickupLocation]
  );

  const saveTrackSnapshot = useCallback(
    (orderId: string) => {
      try {
        const addr = formatTransitAddressByService(
          serviceType,
          pickupAddress.trim() || "Lokasi jemput",
          destAddress.trim()
        );
        sessionStorage.setItem(
          `wira_track_${orderId}`,
          JSON.stringify({
            id: orderId,
            order_status: "paid",
            delivery_address: addr,
          })
        );
      } catch {
        /* ignore */
      }
    },
    [pickupAddress, destAddress, serviceType]
  );

  const bookRide = useCallback(async () => {
    const validation = validateTransitBooking({
      userId,
      serviceType,
      destinationAddress: destAddress,
      distanceKm,
      pickupInServiceArea: pickupAreaOk,
      destinationInServiceArea: destAreaOk,
      sameServiceCity: sameCityOk,
      paymentMethod,
      walletBalance,
      rideFee,
      packageDetails: serviceType === "PAKET" ? packageDetails : null,
    });

    if (!validation.ok) {
      if (!userId) {
        router.push(`/login?next=${encodeURIComponent("/customer/ride")}`);
        return;
      }
      setPlaceError(validation.error);
      return;
    }

    setPlacing(true);
    setPlaceError(null);

    try {
      const payload = buildPlaceRidePayload({
        pickupAddress,
        destinationAddress: destAddress,
        pickupLat,
        pickupLng,
        destLat,
        destLng,
        paymentMethod,
        paymentBypass: isPaymentBypassEnabled(),
        serviceType,
        packageDetails: serviceType === "PAKET" ? packageDetails : undefined,
      });

      const res = await fetch("/api/orders/place-ride", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        paid?: boolean;
        needsPayment?: boolean;
        rideFee?: number;
      };

      if (!res.ok) {
        setPlaceError(json.error ?? `Gagal memesan ${serviceLabel}`);
        return;
      }

      const orderId = json.orderId;
      if (!orderId) {
        setPlaceError("Respons order tidak valid");
        return;
      }

      if (json.paid) {
        saveTrackSnapshot(orderId);
        router.push(`/customer/orders/${orderId}`);
        return;
      }

      if (json.needsPayment) {
        if (isPaymentBypassEnabled()) {
          const confirmRes = await fetch("/api/orders/confirm-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ orderId }),
          });
          const confirmJson = (await confirmRes.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!confirmRes.ok) {
            setPlaceError(confirmJson.error ?? "Gagal mengonfirmasi pembayaran");
            return;
          }
          saveTrackSnapshot(orderId);
          router.push(`/customer/orders/${orderId}`);
          return;
        }

        const qris = await createQrisPayment({
          type: "ngojek",
          amount: json.rideFee ?? rideFee,
          orderId,
        });
        setQrisPayment(qris);
      }
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : "Koneksi gagal. Coba lagi.");
    } finally {
      setPlacing(false);
    }
  }, [
    userId,
    serviceType,
    serviceLabel,
    destAddress,
    distanceKm,
    pickupAreaOk,
    destAreaOk,
    sameCityOk,
    paymentMethod,
    walletBalance,
    rideFee,
    packageDetails,
    pickupAddress,
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    router,
    saveTrackSnapshot,
  ]);

  const onQrisPaid = useCallback(() => {
    const oid = qrisPayment?.orderId;
    if (!oid) return;
    saveTrackSnapshot(oid);
    router.push(`/customer/orders/${oid}`);
  }, [qrisPayment?.orderId, router, saveTrackSnapshot]);

  const handleDestinationSearchSelect = useCallback(
    (loc: GeoLocationPoint) => {
      setDestinationLocation(loc);
      bumpDestinationMapFly();
      setDestSuggestions([]);
      setPlaceError(null);
    },
    [setDestinationLocation, bumpDestinationMapFly]
  );

  const showFlexiblePickup =
    serviceType === "NGOJEK" || serviceType === "NGOMOBIL";

  return {
    authReady,
    userId,
    serviceType,
    setServiceType,
    serviceLabel,
    packageDetails,
    updatePackageField,
    packageVolume,
    needsCargoVehicle,
    cargoVolumeThreshold: PAKET_CARGO_VOLUME_THRESHOLD_CM3,
    pickupAddress,
    onPickupAddressChange,
    pickupLat,
    pickupLng,
    pickupAccuracyM: deviceAccuracyM,
    currentDeviceLocation,
    pickupMapFlyTrigger,
    handlePickupMapIdle,
    handlePickupSearchSelect,
    applyPickupFromDevice,
    destAddress,
    onDestAddressChange,
    destLat,
    destLng,
    placing,
    placeError,
    paymentMethod,
    setPaymentMethod,
    walletBalance,
    qrisPayment,
    setQrisPayment,
    areaAvailable,
    areaMessage,
    destSuggestions,
    geocodingDest,
    mapFlyTrigger,
    gpsLoading,
    quoting,
    distanceKm,
    rideFee,
    feeDescription,
    applyDestinationHit,
    handleDestMapChange,
    refreshPickupGps,
    handleDestinationSearchSelect,
    showFlexiblePickup,
    bookRide,
    onQrisPaid,
    paymentBypass: isPaymentBypassEnabled(),
  };
}
