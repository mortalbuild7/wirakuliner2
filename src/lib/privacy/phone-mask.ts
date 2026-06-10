/**
 * Masking nomor HP customer untuk tampilan driver (UU PDP — minimasi data).
 * Format contoh: 0812-XXXX-8990
 */

export function maskCustomerPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "XXXX-XXXX";

  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `${prefix}-XXXX-${suffix}`;
}

export type CustomerProfileSlice = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

/** Sensor PII customer pada payload order untuk driver. */
export function redactCustomerProfileForDriver<
  T extends { profiles?: CustomerProfileSlice | CustomerProfileSlice[] | null },
>(order: T): T {
  const profiles = order.profiles;
  if (!profiles) return order;

  const maskOne = (p: CustomerProfileSlice): CustomerProfileSlice => ({
    ...p,
    phone: maskCustomerPhone(p.phone),
    email: undefined,
  });

  if (Array.isArray(profiles)) {
    return {
      ...order,
      profiles: profiles.map(maskOne),
    };
  }

  return {
    ...order,
    profiles: maskOne(profiles),
  };
}
