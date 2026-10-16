"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { workspaceChangeEvent } from "@/lib/workspace-events";
export function LiveRefresh({
  userId,
  syncRevision,
}: {
  userId: string;
  syncRevision?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    let lastRefresh = Date.now();
    let dirty = false;
    let knownRevision = syncRevision,
      lastCheck = Date.now(),
      checking = false,
      active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (
        document.visibilityState !== "visible" ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (
        !dirty &&
        (pathname !== "/dashboard" || Date.now() - lastRefresh < 10 * 60000)
      )
        return;
      if (dirty)
        window.dispatchEvent(
          new CustomEvent(workspaceChangeEvent, { detail: { external: true } }),
        );
      dirty = false;
      lastRefresh = Date.now();
      router.refresh();
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("mappleo-workspace")
        : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.userId !== userId) return;
        dirty = true;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 150);
      };
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail?.external) return;
      lastRefresh = Date.now();
      dirty = false;
      channel?.postMessage({ userId });
    };
    const interval =
      pathname === "/dashboard" ? setInterval(refresh, 10 * 60000) : undefined;
    const checkRemote = async () => {
      if (
        knownRevision === undefined ||
        checking ||
        document.visibilityState !== "visible" ||
        Date.now() - lastCheck < 60000
      )
        return;
      checking = true;
      lastCheck = Date.now();
      try {
        const response = await fetch("/api/desktop/version", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (
          active &&
          typeof result.revision === "string" &&
          result.revision !== knownRevision
        ) {
          knownRevision = result.revision;
          dirty = true;
          refresh();
        }
      } catch {
        /* Offline: retain current UI and retry on the next opportunity. */
      } finally {
        checking = false;
      }
    };
    const remoteInterval =
      syncRevision !== undefined
        ? setInterval(() => void checkRemote(), 5 * 60000)
        : undefined;
    const focused = () => {
      refresh();
      void checkRemote();
    };
    // Another tab must not interrupt an open editor. Apply its changes when it closes.
    const observer = new MutationObserver(() => {
      if (!dirty || document.querySelector('[role="dialog"]')) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    window.addEventListener(workspaceChangeEvent, changed);
    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(remoteInterval);
      observer.disconnect();
      clearTimeout(refreshTimer);
      channel?.close();
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
      window.removeEventListener(workspaceChangeEvent, changed);
    };
  }, [router, userId, pathname, syncRevision]);
  return null;
}
