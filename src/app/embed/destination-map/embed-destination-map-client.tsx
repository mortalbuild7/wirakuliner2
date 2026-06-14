"use client";

import { useCallback, useEffect, useState } from "react";
import { LocationMapInner } from "@/components/maps/location-map-inner";
import {
  isWiraMapParentMessage,
  postToParent,
  WIRA_MAP_CHILD_SOURCE,
} from "@/lib/customer-map-bridge";

export function EmbedDestinationMapClient({
  latitude,
  longitude,
  hubLat,
  hubLng,
  hubLabel,
  height,
}: {
  latitude: number;
  longitude: number;
  hubLat: number;
  hubLng: number;
  hubLabel: string;
  height: number;
}) {
  const [flyToTrigger, setFlyToTrigger] = useState(0);
  const [position, setPosition] = useState({ lat: latitude, lng: longitude });

  useEffect(() => {
    document.documentElement.setAttribute("data-embed-map", "true");
    postToParent({ source: WIRA_MAP_CHILD_SOURCE, type: "READY" });
    return () => document.documentElement.removeAttribute("data-embed-map");
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isWiraMapParentMessage(event.data) || event.data.type !== "FLY") return;
      setPosition({ lat: event.data.lat, lng: event.data.lng });
      setFlyToTrigger(event.data.trigger);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onLocationChange = useCallback((lat: number, lng: number) => {
    postToParent({ source: WIRA_MAP_CHILD_SOURCE, type: "CHANGE", lat, lng });
  }, []);

  return (
    <LocationMapInner
      latitude={position.lat}
      longitude={position.lng}
      onLocationChange={onLocationChange}
      hubLat={hubLat}
      hubLng={hubLng}
      hubLabel={hubLabel}
      showRadius={false}
      followGps={false}
      lockZoom={false}
      manualPickMode
      manualPickCenter="both"
      flyToTrigger={flyToTrigger}
      height={height}
    />
  );
}
