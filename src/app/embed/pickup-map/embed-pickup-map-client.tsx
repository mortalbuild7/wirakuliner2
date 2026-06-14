"use client";

import { useCallback, useEffect, useState } from "react";
import { PickupMapInner } from "@/components/maps/pickup-map-inner";
import {
  isWiraMapParentMessage,
  postToParent,
  WIRA_MAP_CHILD_SOURCE,
} from "@/lib/customer-map-bridge";

export function EmbedPickupMapClient({
  centerLat,
  centerLng,
  hubLat,
  hubLng,
  showRadius,
  height,
}: {
  centerLat: number;
  centerLng: number;
  hubLat: number;
  hubLng: number;
  showRadius: boolean;
  height: number;
}) {
  const [panTrigger, setPanTrigger] = useState(0);
  const [center, setCenter] = useState({ lat: centerLat, lng: centerLng });

  useEffect(() => {
    document.documentElement.setAttribute("data-embed-map", "true");
    postToParent({ source: WIRA_MAP_CHILD_SOURCE, type: "READY" });
    return () => document.documentElement.removeAttribute("data-embed-map");
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isWiraMapParentMessage(event.data) || event.data.type !== "PAN") return;
      setCenter({ lat: event.data.lat, lng: event.data.lng });
      setPanTrigger(event.data.trigger);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onMapIdle = useCallback((lat: number, lng: number) => {
    postToParent({ source: WIRA_MAP_CHILD_SOURCE, type: "IDLE", lat, lng });
  }, []);

  return (
    <PickupMapInner
      centerLat={center.lat}
      centerLng={center.lng}
      hubLat={hubLat}
      hubLng={hubLng}
      showRadius={showRadius}
      panTrigger={panTrigger}
      onMapIdle={onMapIdle}
      height={height}
    />
  );
}
