"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import helloAnimation from "@/public/animations/hello.json";
import {
  consumeHelloWelcome,
  shouldShowHelloWelcome,
} from "@/lib/hello-welcome";
import { cn } from "@/lib/utils";

const DISPLAY_MS = 4000;
const FADE_MS = 500;

export function HelloWelcome() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!shouldShowHelloWelcome()) return;

    consumeHelloWelcome();
    setVisible(true);

    const fadeTimer = window.setTimeout(() => setFading(true), DISPLAY_MS - FADE_MS);
    const hideTimer = window.setTimeout(() => setVisible(false), DISPLAY_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[9999] h-44 w-44 transition-opacity duration-500 sm:h-52 sm:w-52 md:h-60 md:w-60",
        fading ? "opacity-0" : "opacity-100"
      )}
      aria-hidden
    >
      <Lottie
        animationData={helloAnimation}
        loop={false}
        autoplay
        className="h-full w-full"
      />
    </div>
  );
}
