import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeAccessBanner } from "@/components/home-access-banner";
import {
  isHomeAdminPanelVisible,
  isHomeDriverPanelVisible,
} from "@/lib/feature-flags";
import { Bike, ChefHat, Shield, Store, UtensilsCrossed } from "lucide-react";

export default function HomePage() {
  const showDriverCard = isHomeDriverPanelVisible();
  const showAdminCard = isHomeAdminPanelVisible();
  const panelCount = 2 + (showDriverCard ? 1 : 0) + (showAdminCard ? 1 : 0);
  const gridCols =
    panelCount >= 4
      ? "lg:grid-cols-4"
      : panelCount === 3
        ? "lg:grid-cols-3"
        : "lg:grid-cols-2";

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-background">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-wira-orange">WIRA Kuliner</h1>
          <Link href="/login">
            <Button variant="outline">Masuk</Button>
          </Link>
        </div>
      </header>
      <div className="px-4">
        <HomeAccessBanner />
      </div>
      <section className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-sm font-medium text-wira-orange">Radius 3 km dari toko yang dipesan</p>
        <h2 className="mt-2 text-4xl font-bold tracking-tight">
          Antar makanan multi-toko, satu platform
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Ongkir otomatis: Rp 10.000 (1–3 km), di atas 3 km +Rp 2.000/km.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/customer">
            <Button size="lg">
              <UtensilsCrossed className="mr-2 h-5 w-5" /> Pesan Makanan
            </Button>
          </Link>
          <Link href="/public-report">
            <Button size="lg" variant="secondary">
              Laporan Publik
            </Button>
          </Link>
        </div>
      </section>
      <section className={`mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-2 ${gridCols}`}>
        <Card>
          <CardHeader>
            <Store className="h-8 w-8 text-wira-orange" />
            <CardTitle className="text-lg">Merchant</CardTitle>
            <CardDescription>Kelola menu & pesanan masuk</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/register?role=merchant">Daftar Toko</Link>
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/login?redirect=/merchant">Masuk Toko</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <ChefHat className="h-8 w-8 text-wira-orange" />
            <CardTitle className="text-lg">Customer</CardTitle>
            <CardDescription>Grid merchant & checkout geospatial</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/customer">
              <Button variant="outline" className="w-full">Mulai Pesan</Button>
            </Link>
          </CardContent>
        </Card>
        <div className={showDriverCard ? undefined : "hidden"} aria-hidden={!showDriverCard}>
          <Card>
            <CardHeader>
              <Bike className="h-8 w-8 text-emerald-600" />
              <CardTitle className="text-lg">Driver</CardTitle>
              <CardDescription>Terima order & antar makanan</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login?redirect=/driver">Masuk Driver App</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className={showAdminCard ? undefined : "hidden"} aria-hidden={!showAdminCard}>
          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 text-wira-orange" />
              <CardTitle className="text-lg">Admin</CardTitle>
              <CardDescription>Onboard merchant & laporan keuangan</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login?redirect=/admin">Panel Admin</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
