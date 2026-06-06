export type UserRole = "admin" | "merchant" | "customer" | "driver";
export type AccountStatus = "active" | "warned" | "suspended" | "blocked";
export type DriverStatus = "idle" | "delivering" | "offline";
export type NegotiationStatus = "none" | "negotiating" | "agreed";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "ready_for_pickup"
  | "on_the_way"
  | "delivered"
  | "cancelled";
export type NegotiationRecordStatus = "pending" | "accepted" | "rejected";

export interface Profile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  account_status?: AccountStatus;
  admin_note?: string | null;
  warned_at?: string | null;
  suspended_until?: string | null;
  created_at: string;
}

export interface Merchant {
  id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  /** Status buka/tutup harian — default true */
  is_open?: boolean;
  admin_suspended?: boolean;
  admin_note?: string | null;
  approval_status?: "pending" | "approved" | "rejected";
  approved_at?: string | null;
  approved_by?: string | null;
  rejection_note?: string | null;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
}

export interface Driver {
  id: string;
  profile_id: string | null;
  name: string;
  phone: string;
  vehicle_plate: string | null;
  photo_url?: string | null;
  status: DriverStatus;
  current_lat: number | null;
  current_lng: number | null;
  fcm_token: string | null;
  reward_points?: number;
}

export type DriverPublicInfo = Pick<
  Driver,
  "id" | "name" | "phone" | "vehicle_plate" | "photo_url"
> & {
  lat?: number | null;
  lng?: number | null;
};

export interface DriverPointTransaction {
  id: string;
  driver_id: string;
  order_id: string | null;
  points: number;
  reason: string;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  merchant_id: string;
  driver_id: string | null;
  total_product_amount: number;
  delivery_fee: number;
  is_outside_radius: boolean;
  negotiation_status: NegotiationStatus;
  order_status: OrderStatus;
  delivery_address: string;
  delivery_lat: number;
  delivery_lng: number;
  distance_km: number | null;
  snap_token: string | null;
  payment_gateway?: string | null;
  created_at: string;
  admin_cancel_reason?: string | null;
  admin_cancelled_at?: string | null;
  admin_cancelled_by?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  offered_driver_id?: string | null;
  offered_at?: string | null;
  offer_skip_driver_ids?: string[];
  merchants?: Merchant;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  product_name: string;
}

export interface Negotiation {
  id: string;
  order_id: string;
  driver_id: string;
  proposed_fee: number;
  status: NegotiationRecordStatus;
}

export interface ChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}
