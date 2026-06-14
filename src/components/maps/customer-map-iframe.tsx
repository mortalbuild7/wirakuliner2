"use client";

import { useEffect, useRef } from "react";
import {
  isWiraMapChildMessage,
  WIRA_MAP_PARENT_SOURCE,
} from "@/lib/customer-map-bridge";

type CustomerMapIframeProps = {
  kind: "pickup" | "destination";
  lat: number;
  lng: number;
  hubLat: number;
  hubLng: number;
  height?: number;
  hubLabel?: string;
  showRadius?: boolean;
  panTrigger?: number;
  flyToTrigger?: number;
  onLocationChange: (lat: number, lng: number) => void;
  ringClass?: string;
  title: string;
};

function buildEmbedSrc(
  kind: "pickup" | "destination",
  props: Pick<
    CustomerMapIframeProps,
    "lat" | "lng" | "hubLat" | "hubLng" | "height" | "hubLabel" | "showRadius"
  >
) {
  const params = new URLSearchParams({
    lat: String(props.lat),
    lng: String(props.lng),
    hubLat: String(props.hubLat),
    hubLng: String(props.hubLng),
    h: String(props.height ?? 240),
  });
  if (props.hubLabel) params.set("hubLabel", props.hubLabel);
  if (props.showRadius) params.set("radius", "1");
  return `/embed/${kind}-map?${params}`;
}

export function CustomerMapIframe({
  kind,
  lat,
  lng,
  hubLat,
  hubLng,
  height = 240,
  hubLabel,
  showRadius = false,
  panTrigger = 0,
  flyToTrigger = 0,
  onLocationChange,
  ringClass = "ring-emerald-500/30",
  title,
}: CustomerMapIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcRef = useRef(
    buildEmbedSrc(kind, { lat, lng, hubLat, hubLng, height, hubLabel, showRadius })
  );
  const onChangeRef = useRef(onLocationChange);
  onChangeRef.current = onLocationChange;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isWiraMapChildMessage(event.data)) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      const { type } = event.data;
      if (type === "IDLE" || type === "CHANGE") {
        onChangeRef.current(event.data.lat, event.data.lng);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    if (kind === "pickup") {
      win.postMessage(
        {
          source: WIRA_MAP_PARENT_SOURCE,
          type: "PAN",
          lat,
          lng,
          trigger: panTrigger,
        },
        window.location.origin
      );
      return;
    }

    win.postMessage(
      {
        source: WIRA_MAP_PARENT_SOURCE,
        type: "FLY",
        lat,
        lng,
        trigger: flyToTrigger,
      },
      window.location.origin
    );
  }, [kind, lat, lng, panTrigger, flyToTrigger]);

  return (
    <div
      className={`customer-map-frame relative z-0 overflow-hidden rounded-2xl ring-1 ${ringClass}`}
      style={{ height }}
    >
      <iframe
        ref={iframeRef}
        src={srcRef.current}
        title={title}
        className="block h-full w-full border-0 bg-white"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
