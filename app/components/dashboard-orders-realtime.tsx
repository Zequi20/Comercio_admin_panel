"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_DEBOUNCE_MS = 250;

export function DashboardOrdersRealtime({
  scopeKey,
}: Readonly<{
  scopeKey: string;
}>) {
  const router = useRouter();

  useEffect(() => {
    const events = new EventSource("/api/orders/events");
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const refreshDashboard = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    };

    events.addEventListener("orders.changed", refreshDashboard);

    return () => {
      events.removeEventListener("orders.changed", refreshDashboard);
      events.close();

      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, [router, scopeKey]);

  return null;
}
