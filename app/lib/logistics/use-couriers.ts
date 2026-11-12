"use client";

import { useEffect, useState } from "react";

export type CourierOption = {
  id: number;
  name: string;
  email: string | null;
  available: boolean | null;
};

type RawCourier = {
  id: number | string;
  name?: string | null;
  available?: boolean;
  isActive?: boolean;
  user?: { email?: string | null; nickname?: string | null } | null;
};

const toOption = (courier: RawCourier): CourierOption => ({
  id: Number(courier.id),
  name: courier.name || courier.user?.nickname || courier.user?.email || `Repartidor #${courier.id}`,
  email: courier.user?.email ?? null,
  available: typeof courier.available === "boolean" ? courier.available : null,
});

/** Couriers of the platform, to show names instead of ids. Loaded once per screen. */
export function useCouriers(): { couriers: CourierOption[]; nameOf: (id: number) => string } {
  const [couriers, setCouriers] = useState<CourierOption[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/couriers", { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { data?: RawCourier[] } | null;
      if (active) setCouriers((body?.data ?? []).map(toOption));
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const nameOf = (id: number) =>
    couriers.find((courier) => courier.id === id)?.name ?? `Repartidor #${id}`;
  return { couriers, nameOf };
}
