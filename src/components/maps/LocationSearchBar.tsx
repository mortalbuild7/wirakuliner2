"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchAddresses } from "@/app/actions/geoActions";
import type { GeoLocationPoint } from "@/types/geo-location";
import { Loader2, Search } from "lucide-react";

export type LocationSearchBarProps = {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onSelect: (location: GeoLocationPoint) => void;
  placeholder?: string;
  nearLat?: number;
  nearLng?: number;
  accentClass?: string;
  disabled?: boolean;
};

/**
 * Pencarian alamat manual dengan autocomplete — hasil klik memicu panTo di peta induk.
 */
export function LocationSearchBar({
  label,
  value,
  onChange,
  onSelect,
  placeholder = "Ketik nama jalan, gedung, atau landmark…",
  nearLat,
  nearLng,
  accentClass = "text-emerald-300",
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
      <Label className={`text-xs ${accentClass}`}>{label}</Label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="border-white/10 bg-white/5 pl-9 pr-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-400" />
        )}
      </div>
      {searchError && (
        <p className="mt-1 text-[10px] text-amber-300/90">{searchError}</p>
      )}
      {suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-2xl border border-white/15 bg-slate-950 shadow-xl">
          {suggestions.map((hit) => (
            <li key={`${hit.latitude}-${hit.longitude}-${hit.address}`}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-xs text-white hover:bg-emerald-500/15"
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
