"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, MessageSquare, Store, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StarRatingInput } from "@/components/ratings/star-rating-input";
import type { RatingTargetType } from "@/lib/ratings";

type RatingRow = {
  target_type: RatingTargetType;
  rating: number;
  comment: string | null;
};

type Props = {
  orderId: string;
  rateableTargets: RatingTargetType[];
};

const TARGET_LABEL: Record<RatingTargetType, { title: string; icon: ReactNode }> = {
  driver: { title: "Driver", icon: <User className="h-4 w-4 text-cyan-400" /> },
  merchant: { title: "Resto / Toko", icon: <Store className="h-4 w-4 text-orange-400" /> },
};

export function OrderRatingPanel({ orderId, rateableTargets }: Props) {
  const [existing, setExisting] = useState<RatingRow[]>([]);
  const [drafts, setDrafts] = useState<
    Record<RatingTargetType, { rating: number; comment: string }>
  >({
    driver: { rating: 0, comment: "" },
    merchant: { rating: 0, comment: "" },
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<RatingTargetType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ratings/order/${orderId}`, { credentials: "include" });
      const json = (await res.json()) as {
        ratings?: RatingRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Gagal memuat rating");
        return;
      }
      setExisting(json.ratings ?? []);
      setError(null);
    } catch {
      setError("Koneksi gagal");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(targetType: RatingTargetType) {
    const draft = drafts[targetType];
    if (draft.rating < 1) {
      setError("Pilih bintang 1–5");
      return;
    }

    setSubmitting(targetType);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/ratings/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId,
          targetType,
          rating: draft.rating,
          comment: draft.comment.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Gagal mengirim rating");
        return;
      }
      setSuccess(`Terima kasih atas ulasan ${TARGET_LABEL[targetType].title.toLowerCase()}!`);
      await load();
    } catch {
      setError("Koneksi gagal");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat form rating...
      </div>
    );
  }

  const pendingTargets = rateableTargets.filter(
    (t) => !existing.some((r) => r.target_type === t)
  );

  if (rateableTargets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-violet-300" />
        <p className="font-medium text-white">Beri rating & komentar</p>
      </div>

      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}
      {success && (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
          {success}
        </Alert>
      )}

      {existing.map((r) => (
        <div key={r.target_type} className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            {TARGET_LABEL[r.target_type].icon}
            {TARGET_LABEL[r.target_type].title}
            <span className="ml-auto text-xs text-emerald-300">Sudah dinilai</span>
          </p>
          <StarRatingInput value={r.rating} onChange={() => {}} disabled size="sm" />
          {r.comment && (
            <p className="mt-2 text-xs text-muted-foreground">&ldquo;{r.comment}&rdquo;</p>
          )}
        </div>
      ))}

      {pendingTargets.map((targetType) => (
        <div key={targetType} className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            {TARGET_LABEL[targetType].icon}
            Nilai {TARGET_LABEL[targetType].title}
          </p>
          <StarRatingInput
            value={drafts[targetType].rating}
            onChange={(rating) =>
              setDrafts((d) => ({ ...d, [targetType]: { ...d[targetType], rating } }))
            }
            disabled={submitting != null}
          />
          <textarea
            value={drafts[targetType].comment}
            onChange={(e) =>
              setDrafts((d) => ({
                ...d,
                [targetType]: { ...d[targetType], comment: e.target.value },
              }))
            }
            placeholder="Komentar (opsional)..."
            maxLength={500}
            rows={3}
            disabled={submitting != null}
            className="w-full resize-none rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:border-violet-500/50 focus:outline-none"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-violet-500/40"
            disabled={submitting != null}
            onClick={() => void submit(targetType)}
          >
            {submitting === targetType ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mengirim...
              </>
            ) : (
              `Kirim rating ${TARGET_LABEL[targetType].title.toLowerCase()}`
            )}
          </Button>
        </div>
      ))}

      {pendingTargets.length === 0 && existing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Semua rating untuk pesanan ini sudah terkirim. Terima kasih!
        </p>
      )}
    </div>
  );
}
