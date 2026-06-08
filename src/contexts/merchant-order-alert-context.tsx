"use client";

import { createContext, useContext } from "react";
import {
  useMerchantOrderAlert,
  type MerchantOrderAlertState,
} from "@/hooks/use-merchant-order-alert";

const MerchantOrderAlertContext = createContext<MerchantOrderAlertState | null>(null);

export function MerchantOrderAlertProvider({ children }: { children: React.ReactNode }) {
  const value = useMerchantOrderAlert();
  return (
    <MerchantOrderAlertContext.Provider value={value}>
      {children}
    </MerchantOrderAlertContext.Provider>
  );
}

export function useMerchantOrderAlertContext(): MerchantOrderAlertState {
  const ctx = useContext(MerchantOrderAlertContext);
  if (!ctx) {
    throw new Error("useMerchantOrderAlertContext must be used within MerchantOrderAlertProvider");
  }
  return ctx;
}
