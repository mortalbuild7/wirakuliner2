"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import deliveryAnimation from "@/public/animations/paketsedangdiantar.json";
import thankYouAnimation from "@/public/animations/thankyou.json";
import {
  isArrivedOrSuccessStatus,
  isOnDeliveryStatus,
} from "@/lib/order-track-lottie";
import type { OrderStatus } from "@/types/database";
import { cn } from "@/lib/utils";

export const THANK_YOU_DISPLAY_MS = 3000;
const THANK_YOU_FADE_MS = 300;

type OrderTrackLottieProps = {
  orderStatus: OrderStatus;
  isDelivery: boolean;
  /** Posisi overlay — default bawah peta (customer); driver APK pakai offset di atas kartu order. */
  className?: string;
};

type ThankYouOverlayOptions = {
  title?: string;
  subtitle?: string;
};

export function useThankYouOverlay() {
  const [showThankYou, setShowThankYou] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [title, setTitle] = useState("Terima Kasih!");
  const [subtitle, setSubtitle] = useState("Sampai jumpa di pesanan berikutnya");
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThankYouTimers = useCallback(() => {
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current);
      displayTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const triggerThankYou = useCallback(
    (options?: ThankYouOverlayOptions) => {
      clearThankYouTimers();
      setTitle(options?.title ?? "Terima Kasih!");
      setSubtitle(options?.subtitle ?? "Sampai jumpa di pesanan berikutnya");
      setShowThankYou(true);
      setIsFadingOut(false);

      displayTimerRef.current = setTimeout(() => {
        setIsFadingOut(true);
        hideTimerRef.current = setTimeout(() => {
          setShowThankYou(false);
          setIsFadingOut(false);
        }, THANK_YOU_FADE_MS);
      }, THANK_YOU_DISPLAY_MS);
    },
    [clearThankYouTimers]
  );

  useEffect(() => () => clearThankYouTimers(), [clearThankYouTimers]);

  return { showThankYou, isFadingOut, title, subtitle, triggerThankYou };
}

export function OrderThankYouOverlayView({
  open,
  isFadingOut,
  title,
  subtitle,
}: {
  open: boolean;
  isFadingOut: boolean;
  title: string;
  subtitle: string;
}) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300",
        isFadingOut ? "opacity-0" : "opacity-100"
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="thank-you-title"
    >
      <div
        className={cn(
          "mx-4 w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl transition-all duration-300",
          isFadingOut ? "scale-95 opacity-0" : "scale-100 opacity-100"
        )}
      >
        <div className="mx-auto max-w-[220px]">
          <Lottie
            animationData={thankYouAnimation}
            loop={false}
            autoplay
            className="h-auto w-full"
          />
        </div>
        <h2 id="thank-you-title" className="mt-2 text-2xl font-bold text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
    </div>
  );
}

export function OrderTrackDeliveryLottie({
  orderStatus,
  isDelivery,
  className,
}: OrderTrackLottieProps) {
  if (!isDelivery || !isOnDeliveryStatus(orderStatus)) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 flex justify-center",
        className ?? "bottom-0 pb-2"
      )}
    >
      <div className="w-full max-w-[200px] drop-shadow-lg">
        <Lottie animationData={deliveryAnimation} loop className="h-auto w-full" />
      </div>
    </div>
  );
}

export function OrderTrackThankYouOverlay({
  orderStatus,
  isDelivery,
}: OrderTrackLottieProps) {
  const { showThankYou, isFadingOut, title, subtitle, triggerThankYou } =
    useThankYouOverlay();
  const prevStatusRef = useRef<OrderStatus | null>(null);

  useEffect(() => {
    const prev = prevStatusRef.current;

    if (
      isDelivery &&
      prev !== null &&
      isArrivedOrSuccessStatus(orderStatus) &&
      !isArrivedOrSuccessStatus(prev)
    ) {
      triggerThankYou();
    }

    prevStatusRef.current = orderStatus;
  }, [orderStatus, isDelivery, triggerThankYou]);

  return (
    <OrderThankYouOverlayView
      open={showThankYou}
      isFadingOut={isFadingOut}
      title={title}
      subtitle={subtitle}
    />
  );
}
