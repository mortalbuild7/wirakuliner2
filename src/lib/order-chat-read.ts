export type OrderChatReaderRole = "customer" | "driver";

export function orderChatLastReadKey(orderId: string, role: OrderChatReaderRole): string {
  return `wira_chat_read_${role}_${orderId}`;
}

/** Tandai semua pesan chat order ini sudah dibaca (sessionStorage). */
export function markOrderChatRead(orderId: string, role: OrderChatReaderRole): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(orderChatLastReadKey(orderId, role), String(Date.now()));
}

export function getOrderChatLastReadIso(
  orderId: string,
  role: OrderChatReaderRole
): string | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(orderChatLastReadKey(orderId, role));
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** @deprecated Gunakan markOrderChatRead(orderId, "driver") */
export function markDriverChatRead(orderId: string): void {
  markOrderChatRead(orderId, "driver");
}
