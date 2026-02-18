"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TenantContextData } from "@/lib/types";

interface TenantContextValue extends TenantContextData {
  hasModule: (moduleSlug: string) => boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

interface TenantProviderProps {
  children: ReactNode;
  value: TenantContextData;
}

export function TenantProvider({
  children,
  value,
}: TenantProviderProps): ReactNode {
  const contextValue: TenantContextValue = {
    ...value,
    hasModule(moduleSlug: string): boolean {
      if (moduleSlug === "_always" || moduleSlug === "brewery") return true;
      return value.subscription.modules.includes(moduleSlug);
    },
  };

  return (
    <TenantContext.Provider value={contextValue}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantContext must be used within TenantProvider");
  }
  return ctx;
}
