import L from "leaflet";
import {
  isNgomobilOrder,
  type OrderChannelRecord,
} from "@/lib/order-channel";
import type { DriverServiceCategory, ServiceType } from "@/types/database";

/** Pin hijau titik jemput NGOJEK. */
export function ngojekPickupIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;height:44px;width:44px;align-items:center;justify-content:center">
      <div style="display:flex;height:40px;width:40px;align-items:center;justify-content:center;border-radius:9999px;background:#10b981;color:#fff;box-shadow:0 4px 16px rgba(16,185,129,.5);border:3px solid rgba(52,211,153,.7)">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2"/></svg>
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Pin biru customer / GPS checkout. */
export function customerPickupIcon(bearingDeg?: number): L.DivIcon {
  const rotation = bearingDeg != null ? `transform:rotate(${bearingDeg}deg);` : "";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;height:44px;width:44px;align-items:center;justify-content:center;${rotation}">
      <div style="display:flex;height:40px;width:40px;align-items:center;justify-content:center;border-radius:9999px;background:#22d3ee;color:#fff;box-shadow:0 4px 16px rgba(34,211,238,.5);border:3px solid rgba(34,211,238,.6)">
        ${
          bearingDeg != null
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 18-3-5-3 5 3-18z"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`
        }
      </div>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

export type DriverGpsVehicle = "motor" | "mobil";

const MARKER_MOTOR_URL = "/markers/markermotorbg.png";
const MARKER_MOBIL_URL = "/markers/markermobilbg.png";
const DRIVER_MARKER_W = 36;
const DRIVER_MARKER_H = 44;

/** Tentukan ikon GPS driver dari jenis layanan pesanan. */
export function driverGpsVehicleFromService(
  serviceType?: ServiceType | string | null,
  deliveryAddress?: string | null
): DriverGpsVehicle {
  const raw = String(serviceType ?? "").trim().toUpperCase();
  if (raw === "NGOMOBIL" || raw === "CAR") return "mobil";
  if (deliveryAddress && isNgomobilOrder(deliveryAddress)) return "mobil";
  return "motor";
}

export function driverGpsVehicleFromOrder(
  order: Pick<OrderChannelRecord, "service_type" | "delivery_address">
): DriverGpsVehicle {
  return driverGpsVehicleFromService(order.service_type, order.delivery_address);
}

/** Ikon driver saat belum ada order aktif — dari kategori armada driver. */
export function driverGpsVehicleFromCategory(
  category?: DriverServiceCategory | string | null
): DriverGpsVehicle {
  const raw = String(category ?? "").trim().toUpperCase();
  if (raw === "MOBIL_PASSENGER" || raw === "MOBIL_CARGO") return "mobil";
  return "motor";
}

/** Marker GPS driver — motor (markermotorbg) atau mobil (markermobilbg). */
export function driverGpsIcon(
  vehicle: DriverGpsVehicle = "motor",
  bearingDeg?: number
): L.DivIcon {
  const rotation =
    bearingDeg != null ? `transform:rotate(${bearingDeg}deg);` : "";
  const url = vehicle === "mobil" ? MARKER_MOBIL_URL : MARKER_MOTOR_URL;
  const w = DRIVER_MARKER_W;
  const h = DRIVER_MARKER_H;
  return L.divIcon({
    className: "wira-driver-gps-marker",
    html: `<div class="wira-driver-gps-marker__wrap" style="width:${w}px;height:${h}px;--wira-driver-marker-w:${w}px;--wira-driver-marker-h:${h}px;${rotation}">
      <img src="${url}" alt="" width="${w}" height="${h}" draggable="false" class="wira-driver-gps-marker__img" />
    </div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

export function driverGpsIconForOrder(
  order: Pick<OrderChannelRecord, "service_type" | "delivery_address">,
  bearingDeg?: number
): L.DivIcon {
  return driverGpsIcon(driverGpsVehicleFromOrder(order), bearingDeg);
}

/** @deprecated Gunakan driverGpsIcon("motor") */
export function driverMotorcycleIcon(bearingDeg?: number): L.DivIcon {
  return driverGpsIcon("motor", bearingDeg);
}
