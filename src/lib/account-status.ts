export type AccountStatus = "active" | "warned" | "suspended" | "blocked";

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Aktif",
  warned: "Peringatan",
  suspended: "Disuspend",
  blocked: "Diblokir",
};

export function isAccountAccessBlocked(profile: {
  account_status?: AccountStatus | string | null;
  suspended_until?: string | null;
}): boolean {
  const status = (profile.account_status ?? "active") as AccountStatus;
  if (status === "blocked") return true;
  if (status === "suspended") {
    if (profile.suspended_until && new Date(profile.suspended_until) < new Date()) {
      return false;
    }
    return true;
  }
  return false;
}

export function hasAccountWarning(profile: {
  account_status?: AccountStatus | string | null;
}): boolean {
  return profile.account_status === "warned";
}
