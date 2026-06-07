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

const MOTORCYCLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="6.5" cy="17.5" r="3.25" fill="currentColor" stroke="none"/>
  <circle cx="17.5" cy="17.5" r="3.25" fill="currentColor" stroke="none"/>
  <circle cx="6.5" cy="17.5" r="1.4" fill="#047857" stroke="none"/>
  <circle cx="17.5" cy="17.5" r="1.4" fill="#047857" stroke="none"/>
  <path d="M9.5 17.5h2"/>
  <path d="M13 17.5h1.5"/>
  <path d="M6.5 14.2 9 8.5h3.5l1.8 3.2h4.2"/>
  <path d="M14.3 8.5 17 5.5"/>
  <path d="M12.5 5.5h2.8"/>
  <path d="M11 8.5V6.2"/>
</svg>`;

/** Ikon motor driver — berputar mengikuti arah navigasi. */
export function driverMotorcycleIcon(bearingDeg?: number): L.DivIcon {
  const rotation = bearingDeg != null ? `transform:rotate(${bearingDeg}deg);` : "";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;height:50px;width:50px;align-items:center;justify-content:center;${rotation}">
      <div style="display:flex;height:44px;width:44px;align-items:center;justify-content:center;border-radius:14px;background:linear-gradient(145deg,#10b981 0%,#047857 100%);color:#ecfdf5;box-shadow:0 4px 16px rgba(16,185,129,.55);border:2px solid #6ee7b7">
        ${MOTORCYCLE_SVG}
      </div>
    </div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  });
}
