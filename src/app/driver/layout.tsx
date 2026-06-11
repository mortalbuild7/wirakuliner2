export const dynamic = "force-dynamic";

import type { Metadata, Viewport } from "next";
import { DriverLayoutClient } from "@/components/driver/driver-layout-client";

export const metadata: Metadata = {
  title: "WIRA Driver — Antar Makanan",
  description: "Aplikasi driver WIRA Kuliner — terima order & antar makanan",
  manifest: "/manifest-driver.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WIRA Driver",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <DriverLayoutClient>{children}</DriverLayoutClient>;
}
