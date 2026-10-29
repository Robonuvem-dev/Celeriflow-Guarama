"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { classifyOperationalDevice, type OperationalDevice } from "@/lib/operational-devices";

export const OperationalContext = createContext<{
  userId: string;
  device: OperationalDevice;
  actionsHost: HTMLDivElement | null;
} | null>(null);

export const OperationalListReset = createContext(0);

export function useOptionalOperationalWorkspace() {
  return useContext(OperationalContext);
}

export function useOperationalWorkspace() {
  const workspace = useOptionalOperationalWorkspace();
  if (!workspace) throw new Error("A listagem operacional precisa do seu workspace.");
  return workspace;
}

export function subscribeOperationalViewport(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

export function useOperationalDevice() {
  return useSyncExternalStore(subscribeOperationalViewport,
    () => classifyOperationalDevice(navigator.userAgent, navigator.maxTouchPoints),
    () => "unclassified" as const);
}
