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
  driver: { title: "Driver", icon: <User className="h-4 w-4 text-cyan-600" /> },
  merchant: { title: "Resto / Toko", icon: <Store className="h-4 w-4 text-orange-600" /> },
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
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
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
    <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/80 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-violet-600" />
        <p className="font-semibold text-slate-900">Beri rating & komentar</p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {success && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900">
          {success}
        </Alert>
      )}

      {existing.map((r) => (
        <div key={r.target_type} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {TARGET_LABEL[r.target_type].icon}
            {TARGET_LABEL[r.target_type].title}
            <span className="ml-auto text-xs font-medium text-emerald-700">Sudah dinilai</span>
          </p>
          <StarRatingInput value={r.rating} onChange={() => {}} disabled size="sm" />
          {r.comment && (
            <p className="mt-2 text-xs text-slate-600">&ldquo;{r.comment}&rdquo;</p>
          )}
        </div>
      ))}

      {pendingTargets.map((targetType) => (
        <div key={targetType} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
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
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <Button
            type="button"
            size="sm"
            className="bg-violet-600 text-white hover:bg-violet-700"
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
        <p className="text-xs text-slate-600">
          Semua rating untuk pesanan ini sudah terkirim. Terima kasih!
        </p>
      )}
    </div>
  );
}
