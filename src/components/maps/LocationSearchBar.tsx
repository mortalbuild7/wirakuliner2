"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchAddresses } from "@/app/actions/geoActions";
import type { GeoLocationPoint } from "@/types/geo-location";
import { Loader2, Search } from "lucide-react";

/** Props komponen pencarian alamat dengan autocomplete dropdown. */
export type LocationSearchBarProps = {
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** Dipanggil saat pengguna memilih saran — parent update store + fly peta. */
  onSelect: (location: GeoLocationPoint) => void;
  placeholder?: string;
  /** Prioritaskan hasil dekat koordinat ini (bias Nominatim viewbox). */
  nearLat?: number;
  nearLng?: number;
  accentClass?: string;
  disabled?: boolean;
};

/**
 * Input pencarian alamat manual — tema terang untuk halaman customer.
 */
export function LocationSearchBar({
  label,
  value,
  onChange,
  onSelect,
  placeholder = "Ketik nama jalan, gedung, atau landmark…",
  nearLat,
  nearLng,
  accentClass = "text-emerald-800",
  disabled = false,
}: LocationSearchBarProps) {
  const [suggestions, setSuggestions] = useState<GeoLocationPoint[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const genRef = useRef(0);
  const skipSearchRef = useRef(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    const gen = ++genRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        setSearchError(null);
        const res = await searchAddresses(q, nearLat, nearLng);
        if (gen !== genRef.current) return;
        setSearching(false);
        if (!res.ok) {
          setSuggestions([]);
          setSearchError(res.error);
          return;
        }
        setSuggestions(res.results);
        if (res.results.length === 0) {
          setSearchError("Alamat tidak ditemukan — coba kata kunci lain");
        }
      })();
    }, 450);

    return () => clearTimeout(timer);
  }, [value, nearLat, nearLng]);

  function pick(loc: GeoLocationPoint) {
    skipSearchRef.current = true;
    onChange(loc.address);
    setSuggestions([]);
    setSearchError(null);
    onSelect(loc);
  }

  return (
    <div className="relative">
      <Label className={`text-xs font-semibold ${accentClass}`}>{label}</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="border-slate-200 bg-white pl-9 pr-9 text-slate-900 placeholder:text-slate-400"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-600" />
        )}
      </div>
      {searchError && (
        <p className="mt-1 text-[10px] font-medium text-amber-700">{searchError}</p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md">
          {suggestions.map((hit) => (
            <li key={`${hit.latitude}-${hit.longitude}-${hit.address}`}>
              <button
                type="button"
                className="w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs text-slate-800 last:border-b-0 hover:bg-emerald-50"
                onClick={() => pick(hit)}
              >
                {hit.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
