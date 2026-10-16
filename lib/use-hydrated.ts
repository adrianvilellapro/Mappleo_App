"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
// Server-rendered actions stay disabled until their confirmation handlers exist.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
