"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, MessageSquare, Star } from "lucide-react";
import { StarRatingDisplay } from "@/components/ratings/star-rating-input";
import { channelLabel } from "@/lib/order-channel";
import type { ReceivedReview } from "@/lib/ratings";

type Props = {
  /** Fetch dengan Bearer token driver (APK) */
  driverMode?: boolean;
  className?: string;
};

type Summary = { avg: number; count: number };

export function ReceivedReviewsPanel({ driverMode = false, className }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ avg: 0, count: 0 });
  const [reviews, setReviews] = useState<ReceivedReview[]>([]);

  const baseFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      if (driverMode) {
        const { fetchWithDriverAuth } = await import("@/lib/driver-native-session");
        return fetchWithDriverAuth(url, init);
      }
      return fetch(url, { credentials: "include", ...init });
    },
    [driverMode]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await baseFetch("/api/ratings/received");
      if (!res.ok) return;
      const json = (await res.json()) as {
        summary?: Summary;
        reviews?: ReceivedReview[];
      };
      setSummary(json.summary ?? { avg: 0, count: 0 });
      setReviews(json.reviews ?? []);
    } finally {
      setLoading(false);
    }
  }, [baseFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = driverMode ? "Ulasan dari customer" : "Ulasan pelanggan";

  return (
    <div className={className}>
      <section className="glass-card p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
          aria-expanded={expanded}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <MessageSquare className="h-4 w-4 text-violet-400" />
            {title}
          </span>
          <span className="flex items-center gap-2">
            {!loading && summary.count > 0 && (
              <StarRatingDisplay value={summary.avg} count={summary.count} size="sm" />
            )}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {expanded && (
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat ulasan...
              </div>
            ) : reviews.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Belum ada ulasan dari customer.
              </p>
            ) : (
              <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {reviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{r.customer_name}</p>
                        {r.order_label && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {channelLabel(r.order_label)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 text-amber-400">
                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                        <span className="text-xs font-semibold">{r.rating}</span>
                      </div>
                    </div>
                    {r.comment ? (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    ) : (
                      <p className="mt-2 text-[10px] italic text-muted-foreground/70">
                        Tanpa komentar
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      {new Date(r.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
