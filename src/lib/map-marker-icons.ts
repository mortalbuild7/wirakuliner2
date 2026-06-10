import L from "leaflet";

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

/** PNG custom — lingkaran hijau + panah arah (public/markers/driver-gps.png, 60×60). */
const DRIVER_GPS_MARKER_URL = "/markers/driver-gps.png";
/** Ukuran tampilan marker driver di peta. */
const DRIVER_MARKER_SIZE = 60;

/** Marker driver — gambar GPS custom, berputar mengikuti arah navigasi. */
export function driverMotorcycleIcon(bearingDeg?: number): L.DivIcon {
  const rotation =
    bearingDeg != null ? `transform:rotate(${bearingDeg}deg);` : "";
  const s = DRIVER_MARKER_SIZE;
  const half = s / 2;
  return L.divIcon({
    className: "wira-driver-gps-marker",
    html: `<div class="wira-driver-gps-marker__wrap" style="width:${s}px;height:${s}px;--wira-driver-marker-size:${s}px;${rotation}">
      <img src="${DRIVER_GPS_MARKER_URL}" alt="" width="${s}" height="${s}" draggable="false" class="wira-driver-gps-marker__img" />
    </div>`,
    iconSize: [s, s],
    iconAnchor: [half, half],
  });
}
