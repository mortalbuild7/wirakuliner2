export type OrderCustomerProfile = {
  name: string;
  phone: string | null;
};

export function pickOrderCustomer(
  profiles?: OrderCustomerProfile | OrderCustomerProfile[] | null
): OrderCustomerProfile | undefined {
  if (profiles == null) return undefined;
  return Array.isArray(profiles) ? profiles[0] : profiles;
}
