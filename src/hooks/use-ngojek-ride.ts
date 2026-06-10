"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GeocodeHit } from "@/lib/geocode";
import { haversineKm, JALAN_WIRA } from "@/lib/geo-config";
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
import { useMapLocation } from "@/hooks/use-map-location";

const REVERSE_MIN_KM = 0.025;

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

  const [pickupAddress, setPickupAddress] = useState("Lokasi saya");
  const [pickupLat, setPickupLat] = useState(JALAN_WIRA.latitude);
  const [pickupLng, setPickupLng] = useState(JALAN_WIRA.longitude);
  const [pickupAccuracyM, setPickupAccuracyM] = useState<number | null>(null);

  const [destAddress, setDestAddress] = useState("");
  const [destLat, setDestLat] = useState(JALAN_WIRA.latitude + 0.01);
  const [destLng, setDestLng] = useState(JALAN_WIRA.longitude + 0.01);

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
  const [mapFlyTrigger, setMapFlyTrigger] = useState(0);

  const [distanceKm, setDistanceKm] = useState(0);
  const [rideFee, setRideFee] = useState(0);
  const [feeDescription, setFeeDescription] = useState("Menghitung tarif...");
  const [quoting, setQuoting] = useState(false);

  const skipForwardGeocodeRef = useRef(false);
  const destFromPinRef = useRef(false);
  const forwardGeocodeGenRef = useRef(0);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReverseCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastForwardQueryRef = useRef("");
  const pickupGeoRef = useRef({ lat: pickupLat, lng: pickupLng });
  pickupGeoRef.current = { lat: pickupLat, lng: pickupLng };

  const { fix: gpsFix, loading: gpsLoading } = useMapLocation(true);

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

  /** Preview tarif dari server (regional_tariffs per service_type). */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setQuoting(true);
        try {
          const res = await fetch("/api/orders/quote-transit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              pickupLat,
              pickupLng,
              destinationLat: destLat,
              destinationLng: destLng,
              serviceType,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            distanceKm?: number;
            rideFee?: number;
            feeDescription?: string;
            areaAvailable?: boolean;
            areaMessage?: string;
            tooClose?: boolean;
            tooFar?: boolean;
          };
          if (cancelled) return;

          setDistanceKm(Number(json.distanceKm ?? 0));
          setRideFee(Number(json.rideFee ?? 0));
          if (json.feeDescription) setFeeDescription(json.feeDescription);
          if (json.areaAvailable === false && json.areaMessage) {
            setAreaMessage(json.areaMessage);
          }
        } catch {
          if (!cancelled) {
            const km = haversineKm(pickupLat, pickupLng, destLat, destLng);
            setDistanceKm(km);
            setFeeDescription("Gagal memuat tarif — coba lagi");
          }
        } finally {
          if (!cancelled) setQuoting(false);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickupLat, pickupLng, destLat, destLng, serviceType]);

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

  useEffect(() => {
    if (!gpsFix) return;
    setPickupLat(gpsFix.lat);
    setPickupLng(gpsFix.lng);
    setPickupAccuracyM(gpsFix.accuracy);

    void reverseGeocode(gpsFix.lat, gpsFix.lng).then((hit) => {
      if (hit) setPickupAddress(hit.label);
    });
  }, [gpsFix?.lat, gpsFix?.lng, gpsFix?.accuracy]);

  const applyDestinationCoords = useCallback((lat: number, lng: number, fly = true) => {
    setDestLat(lat);
    setDestLng(lng);
    if (fly) setMapFlyTrigger((n) => n + 1);
  }, []);

  const applyDestinationHit = useCallback(
    (hit: GeocodeHit) => {
      forwardGeocodeGenRef.current += 1;
      destFromPinRef.current = true;
      skipForwardGeocodeRef.current = true;
      setDestAddress(hit.label);
      applyDestinationCoords(hit.lat, hit.lng);
      setDestSuggestions([]);
    },
    [applyDestinationCoords]
  );

  const reverseGeocodeDest = useCallback(async (lat: number, lng: number) => {
    const hit = await reverseGeocode(lat, lng);
    if (hit) {
      destFromPinRef.current = true;
      skipForwardGeocodeRef.current = true;
      setDestAddress(hit.label);
      lastReverseCoordsRef.current = { lat, lng };
    }
  }, []);

  useEffect(() => {
    if (destFromPinRef.current) return;
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
    };
  }, []);

  const refreshPickupGps = useCallback(() => {
    if (!navigator.geolocation) {
      setPlaceError("GPS tidak tersedia di perangkat ini");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickupLat(pos.coords.latitude);
        setPickupLng(pos.coords.longitude);
        setPickupAccuracyM(pos.coords.accuracy);
        setPlaceError(null);
        void reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((hit) => {
          if (hit) setPickupAddress(hit.label);
        });
      },
      () => setPlaceError("Gagal mengambil lokasi GPS. Izinkan akses lokasi."),
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }, []);

  const onDestAddressChange = useCallback((value: string) => {
    destFromPinRef.current = false;
    lastForwardQueryRef.current = "";
    setPlaceError(null);
    setDestAddress(value);
  }, []);

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
    setPickupAddress,
    pickupLat,
    pickupLng,
    pickupAccuracyM,
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
    bookRide,
    onQrisPaid,
    paymentBypass: isPaymentBypassEnabled(),
  };
}
