export const WIRA_MAP_CHILD_SOURCE = "wira-map" as const;
export const WIRA_MAP_PARENT_SOURCE = "wira-map-parent" as const;

export type WiraMapChildMessage =
  | { source: typeof WIRA_MAP_CHILD_SOURCE; type: "IDLE"; lat: number; lng: number }
  | { source: typeof WIRA_MAP_CHILD_SOURCE; type: "CHANGE"; lat: number; lng: number }
  | { source: typeof WIRA_MAP_CHILD_SOURCE; type: "READY" };

export type WiraMapParentMessage =
  | {
      source: typeof WIRA_MAP_PARENT_SOURCE;
      type: "PAN";
      lat: number;
      lng: number;
      trigger: number;
    }
  | {
      source: typeof WIRA_MAP_PARENT_SOURCE;
      type: "FLY";
      lat: number;
      lng: number;
      trigger: number;
    };

export function postToParent(message: WiraMapChildMessage) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

export function isWiraMapChildMessage(data: unknown): data is WiraMapChildMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as WiraMapChildMessage).source === WIRA_MAP_CHILD_SOURCE
  );
}

export function isWiraMapParentMessage(data: unknown): data is WiraMapParentMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as WiraMapParentMessage).source === WIRA_MAP_PARENT_SOURCE
  );
}
