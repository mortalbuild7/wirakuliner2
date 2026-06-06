import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BrandRootCredit } from "@/components/brand/brand-root-credit";
import { POWERED_BY, POWERED_BY_INSPECT, POWERED_BY_URL } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WIRA Kuliner — Antar Makanan",
  description: "Multi-merchant food delivery — radius 3 km dari toko",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  authors: [{ name: "DAFFACELL", url: POWERED_BY_URL }],
  other: {
    "powered-by": POWERED_BY,
    generator: `WIRA Kuliner — ${POWERED_BY_INSPECT}`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-powered-by="DAFFACELL">
      <body
        className={inter.className}
        data-app="wira-kuliner"
        data-engineered-by="DAFFACELL"
        data-vendor={POWERED_BY_URL}
      >
        <BrandRootCredit />
        {children}
      </body>
    </html>
  );
}
