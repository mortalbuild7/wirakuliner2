"use client";

import { useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import deliveryAnimation from "@/public/animations/paketsedangdiantar.json";
import thankYouAnimation from "@/public/animations/thankyou.json";
import {
  isArrivedOrSuccessStatus,
  isOnDeliveryStatus,
} from "@/lib/order-track-lottie";
import type { OrderStatus } from "@/types/database";
import { cn } from "@/lib/utils";

const THANK_YOU_DISPLAY_MS = 2000;
const THANK_YOU_FADE_MS = 300;

type OrderTrackLottieProps = {
  orderStatus: OrderStatus;
  isDelivery: boolean;
};

export function OrderTrackDeliveryLottie({
  orderStatus,
  isDelivery,
}: OrderTrackLottieProps) {
  if (!isDelivery || !isOnDeliveryStatus(orderStatus)) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2">
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
  const [showThankYou, setShowThankYou] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const prevStatusRef = useRef<OrderStatus | null>(null);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThankYouTimers = () => {
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current);
      displayTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => {
    const prev = prevStatusRef.current;

    if (
      isDelivery &&
      prev !== null &&
      isArrivedOrSuccessStatus(orderStatus) &&
      !isArrivedOrSuccessStatus(prev)
    ) {
      clearThankYouTimers();
      setShowThankYou(true);
      setIsFadingOut(false);

      displayTimerRef.current = setTimeout(() => {
        setIsFadingOut(true);
        hideTimerRef.current = setTimeout(() => {
          setShowThankYou(false);
          setIsFadingOut(false);
        }, THANK_YOU_FADE_MS);
      }, THANK_YOU_DISPLAY_MS);
    }

    prevStatusRef.current = orderStatus;
  }, [orderStatus, isDelivery]);

  useEffect(() => () => clearThankYouTimers(), []);

  if (!showThankYou) return null;

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
          isFadingOut
            ? "scale-95 opacity-0"
            : "scale-100 opacity-100"
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
        <h2
          id="thank-you-title"
          className="mt-2 text-2xl font-bold text-slate-900"
        >
          Terima Kasih!
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Sampai jumpa di pesanan berikutnya
        </p>
      </div>
    </div>
  );
}
