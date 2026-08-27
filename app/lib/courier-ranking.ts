import type { Courier, Order } from "./services/commerce-services";

export const COURIER_RANKING_TIME_ZONE = "America/Asuncion";
export const COURIER_RANKING_LIMIT = 10;

export type CourierRankingEntry = {
  position: number;
  courierId: number | string;
  name: string;
  completedOrders: number;
};

export type MonthlyCourierRanking = {
  monthKey: string;
  monthLabel: string;
  activeCourierCount: number;
  completedOrders: number;
  entries: CourierRankingEntry[];
};

const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: COURIER_RANKING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

const monthLabelFormatter = new Intl.DateTimeFormat("es-PY", {
  timeZone: COURIER_RANKING_TIME_ZONE,
  year: "numeric",
  month: "long",
});

function monthKey(date: Date) {
  const parts = monthKeyFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return year && month ? `${year}-${month}` : "";
}

function monthLabel(date: Date) {
  const label = monthLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deliveredAt(order: Order) {
  const history = order.history ?? [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (entry.toStatus === "DELIVERED") {
      const changedAt = validDate(entry.changedAt);
      if (changedAt) return changedAt;
    }
  }

  return validDate(order.updatedAt);
}

function courierName(courier: Courier) {
  return (
    courier.name ??
    courier.user?.name ??
    courier.user?.nickname ??
    courier.user?.email ??
    `Repartidor #${courier.id}`
  );
}

export function buildMonthlyCourierRanking({
  couriers,
  orders,
  now = new Date(),
  limit = COURIER_RANKING_LIMIT,
}: {
  couriers: Courier[];
  orders: Order[];
  now?: Date;
  limit?: number;
}): MonthlyCourierRanking {
  const currentMonthKey = monthKey(now);
  const activeCouriers = couriers.filter((courier) => courier.isActive);
  const completedByCourier = new Map(
    activeCouriers.map((courier) => [String(courier.id), 0])
  );

  for (const order of orders) {
    if (order.status !== "DELIVERED" || !order.courier?.id) continue;

    const courierId = String(order.courier.id);
    if (!completedByCourier.has(courierId)) continue;

    const completionDate = deliveredAt(order);
    if (!completionDate || monthKey(completionDate) !== currentMonthKey) continue;

    completedByCourier.set(
      courierId,
      (completedByCourier.get(courierId) ?? 0) + 1
    );
  }

  const entries = activeCouriers
    .map((courier) => ({
      courierId: courier.id,
      name: courierName(courier),
      completedOrders: completedByCourier.get(String(courier.id)) ?? 0,
    }))
    .sort((first, second) => {
      const completedDifference =
        second.completedOrders - first.completedOrders;

      if (completedDifference !== 0) return completedDifference;

      const nameDifference = first.name.localeCompare(second.name, "es", {
        sensitivity: "base",
      });

      return nameDifference !== 0
        ? nameDifference
        : String(first.courierId).localeCompare(String(second.courierId), "es", {
            numeric: true,
          });
    })
    .slice(0, Math.max(0, limit))
    .map((entry, index) => ({ ...entry, position: index + 1 }));

  return {
    monthKey: currentMonthKey,
    monthLabel: monthLabel(now),
    activeCourierCount: activeCouriers.length,
    completedOrders: Array.from(completedByCourier.values()).reduce(
      (total, completed) => total + completed,
      0
    ),
    entries,
  };
}
