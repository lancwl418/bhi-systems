"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Silently re-fetches server data on an interval so records written by the
// support agent show up without a manual reload. router.refresh() re-renders
// server components only — client state (e.g. a note being typed) survives.
// Paused while the tab is hidden.
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
