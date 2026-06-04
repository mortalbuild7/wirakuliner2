export type UserRole = "admin" | "merchant" | "customer" | "driver";
export type DriverStatus = "idle" | "delivering" | "offline";
export type NegotiationStatus = "none" | "negotiating" | "agreed";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
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
  created_at: string;
}

export interface Merchant {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
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
  status: DriverStatus;
  current_lat: number | null;
  current_lng: number | null;
  fcm_token: string | null;
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
  created_at: string;
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
