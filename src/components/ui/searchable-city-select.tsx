"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchableCitySelectProps = {
  cities: readonly string[];
  value: string;
  onChange: (cityName: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  id?: string;
  required?: boolean;
  className?: string;
};

export function SearchableCitySelect({
  cities,
  value,
  onChange,
  disabled = false,
  loading = false,
  placeholder = "— Pilih kota / kabupaten —",
  emptyMessage = "Tidak ada kota untuk provinsi ini",
  id,
  required,
  className,
}: SearchableCitySelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...cities];
    return cities.filter((c) => c.toLowerCase().includes(q));
  }, [cities, query]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, query]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function selectCity(city: string) {
    onChange(city);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!disabled && !loading && cities.length > 0) setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      selectCity(filtered[activeIndex]);
    }
  }

  const showPlaceholder = loading
    ? "Memuat daftar kota…"
    : cities.length === 0
      ? emptyMessage
      : placeholder;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled || loading || cities.length === 0}
        onClick={() => {
          if (disabled || loading || cities.length === 0) return;
          setOpen((o) => !o);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "mt-1 flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200/60 bg-slate-50 px-4 text-left text-sm text-slate-900 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60",
          !value && "text-slate-500"
        )}
      >
        <span className="truncate">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Memuat…
            </span>
          ) : value ? (
            value
          ) : (
            showPlaceholder
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-600 transition",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          value={value}
          required
          onChange={() => {}}
        />
      )}

      {open && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
          role="presentation"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik nama kota…"
              className="h-9 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              aria-label="Cari kota"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded p-0.5 text-slate-500 hover:text-slate-900"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ul
            id={listboxId}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
            aria-label="Daftar kota"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-600">
                Tidak ditemukan untuk &quot;{query}&quot;
              </li>
            ) : (
              filtered.map((city, index) => {
                const selected = city === value;
                const active = index === activeIndex;
                return (
                  <li
                    key={city}
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "cursor-pointer px-4 py-2.5 text-sm text-slate-900",
                      active && "bg-emerald-50",
                      selected && "font-semibold text-emerald-800"
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectCity(city)}
                  >
                    {city}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
