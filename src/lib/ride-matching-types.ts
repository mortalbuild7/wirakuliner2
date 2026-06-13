export type RideMatchingMode =
  | "intra_cluster"
  | "intra_province"
  | "borderline"
  | "customer_proximity";

export type PriorityDriverMatchRow = {
  driver_id: string;
  distance_km: number;
  priority_score: number;
  completion_rate: number;
  acceptance_rate: number;
  average_rating: number;
  service_category?: string;
  match_mode?: RideMatchingMode;
  driver_province_id?: number | null;
  is_borderline?: boolean;
};
