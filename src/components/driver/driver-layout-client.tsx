"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { DriverProfileProvider } from "@/contexts/driver-profile-context";
import { DriverSessionBootstrap } from "@/components/driver/driver-session-bootstrap";
import { DriverChunkRecovery } from "@/components/driver/driver-chunk-recovery";
import { DriverShell } from "@/components/driver/driver-shell";

const DriverBridges = dynamic(
  () => import("@/components/driver/driver-bridges").then((m) => m.DriverBridges),
  { ssr: false }
);

/** Layout driver — bridge HTML terpisah; di sini hanya halaman /driver/* */
export function DriverLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const minimal =
    pathname.startsWith("/driver/app-entry") || pathname.startsWith("/driver/setup");

  if (minimal) {
    return <DriverShell>{children}</DriverShell>;
  }

  return (
    <DriverProfileProvider>
      <DriverChunkRecovery />
      <DriverSessionBootstrap />
      <DriverShell>
        <DriverBridges />
        {children}
      </DriverShell>
    </DriverProfileProvider>
  );
}
