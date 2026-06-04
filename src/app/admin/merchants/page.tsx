"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Merchant } from "@/types/database";

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [form, setForm] = useState({
    name: "",
    owner_id: "",
    address: "",
    lat: "-5.1348",
    lng: "119.4065",
  });
  const supabase = createClient();

  function load() {
    supabase.from("merchants").select("*").then(({ data }) => setMerchants(data ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function createMerchant(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("merchants").insert({
      name: form.name,
      owner_id: form.owner_id,
      address: form.address,
      latitude: Number(form.lat),
      longitude: Number(form.lng),
      is_active: true,
    });
    load();
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Kelola Merchant</h1>
      <form onSubmit={createMerchant} className="mt-4 grid max-w-md gap-2">
        <div>
          <Label>Nama toko</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <Label>Owner UUID (profiles)</Label>
          <Input value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} required />
        </div>
        <div>
          <Label>Alamat</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <Button type="submit">Onboard Merchant</Button>
      </form>
      <ul className="mt-6 space-y-2">
        {merchants.map((m) => (
          <li key={m.id} className="rounded-lg border p-3">
            <strong>{m.name}</strong> — {m.is_active ? "Aktif" : "Nonaktif"}
          </li>
        ))}
      </ul>
    </main>
  );
}
