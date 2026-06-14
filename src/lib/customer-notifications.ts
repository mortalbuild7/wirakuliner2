/** Antrian notifikasi in-app customer — popup slide dari atas layar HP. */

export type CustomerNotificationKind = "chat" | "status" | "driver" | "payment";

export type CustomerNotification = {
  id: string;
  kind: CustomerNotificationKind;
  orderId: string;
  title: string;
  body: string;
  href: string;
  createdAt: number;
};

type Listener = (items: CustomerNotification[]) => void;

const AUTO_DISMISS_MS = 7_000;
const MAX_QUEUE = 6;

class CustomerNotificationStore {
  private items: CustomerNotification[] = [];
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = [...this.items];
    this.listeners.forEach((fn) => fn(snapshot));
  }

  push(
    item: Omit<CustomerNotification, "id" | "createdAt"> & { id?: string }
  ): CustomerNotification {
    const next: CustomerNotification = {
      id: item.id ?? `${item.kind}-${item.orderId}-${Date.now()}`,
      kind: item.kind,
      orderId: item.orderId,
      title: item.title,
      body: item.body,
      href: item.href,
      createdAt: Date.now(),
    };

    this.items = [next, ...this.items.filter((x) => x.id !== next.id)].slice(0, MAX_QUEUE);
    this.emit();

    const prev = this.timers.get(next.id);
    if (prev) clearTimeout(prev);
    this.timers.set(
      next.id,
      setTimeout(() => this.dismiss(next.id), AUTO_DISMISS_MS)
    );

    return next;
  }

  dismiss(id: string): void {
    const t = this.timers.get(id);
    if (t) {
      clearTimeout(t);
      this.timers.delete(id);
    }
    if (!this.items.some((x) => x.id === id)) return;
    this.items = this.items.filter((x) => x.id !== id);
    this.emit();
  }

  clear(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.items = [];
    this.emit();
  }
}

export const customerNotificationStore = new CustomerNotificationStore();

export function pushCustomerNotification(
  item: Omit<CustomerNotification, "id" | "createdAt"> & { id?: string }
): CustomerNotification {
  return customerNotificationStore.push(item);
}
