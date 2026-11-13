/**
 * Splitting a carrier sheet among couriers. Stops (rows sharing an address) are the unit, so an
 * address is never shared by two couriers. Pure functions: the screen calls them and the merchant
 * adjusts the result by hand.
 */

export type SplitStop = {
  key: string;
  locality: string | null;
  shipments: number;
  packages: number;
  amountToCollect: number;
};

export type SplitMethod = "locality" | "balanced";

/** Stop key → courier id. A stop without an entry is not assigned yet. */
export type Assignment = Record<string, number>;

export type CourierLoad = {
  courierId: number;
  stops: number;
  shipments: number;
  packages: number;
  amountToCollect: number;
};

const NO_LOCALITY = "Sin localidad";

/** Guides are what takes time on the street, so they are what gets balanced. */
const weightOf = (stop: SplitStop) => Math.max(1, stop.shipments);

/** "CORONEL OVIEDO" and "Coronel Oviedo" are the same locality: compared and shown in capitals. */
export const localityOf = (stop: Pick<SplitStop, "locality">): string =>
  stop.locality?.trim().replace(/\s+/g, " ").toLocaleUpperCase("es") || NO_LOCALITY;

/**
 * Consecutive chunks of the sheet with a similar number of guides each. The sheet order usually
 * follows the carrier's own route, so neighbouring stops stay with the same courier. Every courier
 * gets at least one stop when there are enough stops.
 */
export function splitBalanced(stops: readonly SplitStop[], courierIds: readonly number[]): Assignment {
  const assignment: Assignment = {};
  if (stops.length === 0 || courierIds.length === 0) return assignment;
  let remaining = stops.reduce((sum, stop) => sum + weightOf(stop), 0);
  let start = 0;
  courierIds.forEach((courierId, index) => {
    const couriersLeft = courierIds.length - index;
    if (start >= stops.length) return;
    if (couriersLeft === 1) {
      for (let i = start; i < stops.length; i += 1) assignment[stops[i].key] = courierId;
      start = stops.length;
      return;
    }
    const target = remaining / couriersLeft;
    // Leave at least one stop for each courier still to serve.
    const lastEnd = Math.max(start + 1, stops.length - (couriersLeft - 1));
    let taken = 0;
    let end = start;
    while (end < lastEnd) {
      const weight = weightOf(stops[end]);
      // On a tie, cut here: the remainder goes to the couriers that come later.
      if (end > start && Math.abs(taken + weight - target) >= Math.abs(taken - target)) break;
      taken += weight;
      end += 1;
    }
    for (let i = start; i < end; i += 1) assignment[stops[i].key] = courierId;
    remaining -= taken;
    start = end;
  });
  return assignment;
}

/**
 * Splits by locality without leaving anyone overloaded. Each locality gets a number of couriers in
 * proportion to its guides (a big locality is cut in consecutive chunks among several couriers);
 * localities too small for a courier of their own stay whole and go to whoever has the least
 * guides so far.
 */
export function splitByLocality(stops: readonly SplitStop[], courierIds: readonly number[]): Assignment {
  const assignment: Assignment = {};
  if (stops.length === 0 || courierIds.length === 0) return assignment;

  const groups = new Map<string, SplitStop[]>();
  for (const stop of stops) {
    const locality = localityOf(stop);
    groups.set(locality, [...(groups.get(locality) ?? []), stop]);
  }
  const total = stops.reduce((sum, stop) => sum + weightOf(stop), 0);
  const fair = total / courierIds.length;
  const localities = Array.from(groups.entries())
    .map(([name, members]) => {
      const weight = members.reduce((sum, stop) => sum + weightOf(stop), 0);
      // Half a courier's worth or more earns a courier of its own; never more couriers than stops.
      const share = Math.min(members.length, Math.round(weight / fair));
      return { name, members, weight, share };
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

  const perCourier = (locality: { weight: number; share: number }) =>
    locality.share === 0 ? Number.POSITIVE_INFINITY : locality.weight / locality.share;
  let shares = localities.reduce((sum, locality) => sum + locality.share, 0);
  // Too many couriers asked for: take one from the locality that would miss it least.
  while (shares > courierIds.length) {
    const lightest = localities
      .filter((locality) => locality.share > 0)
      .sort((a, b) => perCourier(a) - perCourier(b))[0];
    lightest.share -= 1;
    shares -= 1;
  }
  // Couriers left over and nothing small to give them: add them where the load per courier is highest.
  const hasSmall = localities.some((locality) => locality.share === 0);
  while (shares < courierIds.length && !hasSmall) {
    const busiest = localities
      .filter((locality) => locality.share < locality.members.length)
      .sort((a, b) => perCourier(b) - perCourier(a))[0];
    if (!busiest) break;
    busiest.share += 1;
    shares += 1;
  }

  const load = new Map(courierIds.map((courierId) => [courierId, 0]));
  let next = 0;
  for (const locality of localities.filter((item) => item.share > 0)) {
    const couriers = courierIds.slice(next, next + locality.share);
    next += locality.share;
    const part = splitBalanced(locality.members, couriers);
    Object.assign(assignment, part);
    for (const stop of locality.members) {
      load.set(part[stop.key], (load.get(part[stop.key]) ?? 0) + weightOf(stop));
    }
  }
  // Small localities, heaviest first, to whoever has the least guides (couriers still empty first).
  for (const locality of localities.filter((item) => item.share === 0)) {
    const [lightest] = [...courierIds].sort(
      (a, b) => load.get(a)! - load.get(b)! || courierIds.indexOf(a) - courierIds.indexOf(b)
    );
    for (const stop of locality.members) assignment[stop.key] = lightest;
    load.set(lightest, load.get(lightest)! + locality.weight);
  }
  return assignment;
}

export function suggestSplit(
  stops: readonly SplitStop[],
  courierIds: readonly number[],
  method: SplitMethod
): Assignment {
  return method === "locality" ? splitByLocality(stops, courierIds) : splitBalanced(stops, courierIds);
}

/** What each courier would take, in the order the couriers were added. */
export function loadsOf(
  stops: readonly SplitStop[],
  assignment: Assignment,
  courierIds: readonly number[]
): CourierLoad[] {
  const loads = new Map<number, CourierLoad>(
    courierIds.map((courierId) => [courierId, { courierId, stops: 0, shipments: 0, packages: 0, amountToCollect: 0 }])
  );
  for (const stop of stops) {
    const load = loads.get(assignment[stop.key]);
    if (!load) continue;
    load.stops += 1;
    load.shipments += stop.shipments;
    load.packages += stop.packages;
    load.amountToCollect += stop.amountToCollect;
  }
  return courierIds.map((courierId) => loads.get(courierId)!);
}

/** Request body for the API: the stop keys of each courier, keeping only couriers in the split. */
export function toAssignments(
  stops: readonly SplitStop[],
  assignment: Assignment,
  courierIds: readonly number[]
): { courierId: number; stopKeys: string[] }[] {
  return courierIds.map((courierId) => ({
    courierId,
    stopKeys: stops.filter((stop) => assignment[stop.key] === courierId).map((stop) => stop.key),
  }));
}
