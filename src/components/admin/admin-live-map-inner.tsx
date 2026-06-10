"use client";

import { useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { LiveDriverPin } from "@/lib/admin/live-drivers";
import { JALAN_WIRA } from "@/lib/geo-config";
import { driverMotorcycleIcon } from "@/lib/map-marker-icons";

const driverPinIcon = driverMotorcycleIcon();

export function AdminLiveMapInner({ drivers }: { drivers: LiveDriverPin[] }) {
  const center = useMemo(() => {
    if (!drivers.length) {
      return { lat: JALAN_WIRA.latitude, lng: JALAN_WIRA.longitude };
    }
    const lat = drivers.reduce((s, d) => s + d.lat, 0) / drivers.length;
    const lng = drivers.reduce((s, d) => s + d.lng, 0) / drivers.length;
    return { lat, lng };
  }, [drivers]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={drivers.length ? 13 : 11}
      className="h-[480px] w-full rounded-xl z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {drivers.map((d) => (
        <Marker
          key={d.id}
          position={[d.lat, d.lng]}
          icon={driverPinIcon}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{d.name}</p>
              <p className="text-xs text-stone-600">
                {d.status} · {d.serviceCategory ?? "MOTOR_HYBRID"}
              </p>
              {d.vehiclePlate && (
                <p className="text-xs">{d.vehiclePlate}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
