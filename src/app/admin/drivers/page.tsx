"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Driver } from "@/types/database";

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const supabase = createClient();

  function load() {
    supabase.from("drivers").select("*").then(({ data }) => setDrivers(data ?? []));
  }

  useEffect(() => {
    load();
  }, []);

  async function registerDriver(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("drivers").insert({
      name,
      phone,
      vehicle_plate: plate,
      status: "offline",
    });
    setName("");
    setPhone("");
    setPlate("");
    load();
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Kelola Driver</h1>
      <form onSubmit={registerDriver} className="mt-4 flex flex-wrap gap-2">
        <div>
          <Label>Nama</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Telepon</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <Label>Plat</Label>
          <Input value={plate} onChange={(e) => setPlate(e.target.value)} />
        </div>
        <Button type="submit" className="self-end">Daftarkan</Button>
      </form>
      <ul className="mt-6 space-y-2">
        {drivers.map((d) => (
          <li key={d.id} className="rounded-lg border p-3">
            {d.name} — {d.phone} — <span className="capitalize">{d.status}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
