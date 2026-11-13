import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  loadsOf,
  splitBalanced,
  splitByLocality,
  toAssignments,
  type SplitStop,
} from "../../app/lib/logistics/split-suggestion";

const stop = (key: string, locality: string | null, shipments = 1): SplitStop => ({
  key,
  locality,
  shipments,
  packages: shipments,
  amountToCollect: shipments * 100_000,
});

const ownersInOrder = (stops: SplitStop[], assignment: Record<string, number>) => stops.map((s) => assignment[s.key]);

describe("partes iguales", () => {
  it("cuts the sheet in consecutive chunks with a similar number of guides", () => {
    const stops = Array.from({ length: 10 }, (_, i) => stop(`s${i}`, "Coronel Oviedo"));
    const assignment = splitBalanced(stops, [1, 2, 3]);
    assert.deepEqual(ownersInOrder(stops, assignment), [1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
  });

  it("balances guides, not stops", () => {
    const stops = [stop("a", null, 6), stop("b", null, 1), stop("c", null, 1), stop("d", null, 1), stop("e", null, 3)];
    const loads = loadsOf(stops, splitBalanced(stops, [1, 2]), [1, 2]).map((load) => load.shipments);
    assert.deepEqual(loads, [6, 6]);
  });

  it("gives every courier at least one stop when there are enough", () => {
    const stops = [stop("a", null, 50), stop("b", null, 1), stop("c", null, 1)];
    const loads = loadsOf(stops, splitBalanced(stops, [1, 2, 3]), [1, 2, 3]);
    assert.ok(loads.every((load) => load.stops === 1));
  });

  it("leaves extra couriers empty when there are fewer stops than couriers", () => {
    const stops = [stop("a", null), stop("b", null)];
    const loads = loadsOf(stops, splitBalanced(stops, [1, 2, 3]), [1, 2, 3]).map((load) => load.stops);
    assert.deepEqual(loads, [1, 1, 0]);
  });
});

describe("por localidad", () => {
  it("keeps each locality with a single courier and balances the totals", () => {
    const stops = [
      ...Array.from({ length: 6 }, (_, i) => stop(`co${i}`, "Coronel Oviedo")),
      ...Array.from({ length: 4 }, (_, i) => stop(`ca${i}`, "Caaguazú")),
      ...Array.from({ length: 2 }, (_, i) => stop(`vi${i}`, "Villarrica")),
    ];
    const assignment = splitByLocality(stops, [1, 2]);
    for (const locality of ["Coronel Oviedo", "Caaguazú", "Villarrica"]) {
      const owners = new Set(stops.filter((s) => s.locality === locality).map((s) => assignment[s.key]));
      assert.equal(owners.size, 1, `${locality} quedó partida`);
    }
    assert.deepEqual(loadsOf(stops, assignment, [1, 2]).map((load) => load.shipments), [6, 6]);
  });

  it("splits the busiest locality when there are more couriers than localities", () => {
    const stops = [
      ...Array.from({ length: 9 }, (_, i) => stop(`co${i}`, "Coronel Oviedo")),
      ...Array.from({ length: 3 }, (_, i) => stop(`ca${i}`, "Caaguazú")),
    ];
    const assignment = splitByLocality(stops, [1, 2, 3, 4]);
    const loads = loadsOf(stops, assignment, [1, 2, 3, 4]);
    assert.ok(loads.every((load) => load.stops === 3), JSON.stringify(loads));
    const caaguazu = new Set(stops.filter((s) => s.locality === "Caaguazú").map((s) => assignment[s.key]));
    assert.equal(caaguazu.size, 1);
  });

  it("does not overload one courier when a locality dominates the sheet", () => {
    // Coronel Oviedo has 60% of the guides; three couriers.
    const stops = [
      ...Array.from({ length: 18 }, (_, i) => stop(`co${i}`, "Coronel Oviedo", i % 3 === 0 ? 3 : 1)),
      ...Array.from({ length: 6 }, (_, i) => stop(`ca${i}`, "Caaguazú", i % 3 === 0 ? 3 : 1)),
      ...Array.from({ length: 6 }, (_, i) => stop(`vi${i}`, "Villarrica", i % 3 === 0 ? 3 : 1)),
    ];
    const loads = loadsOf(stops, splitByLocality(stops, [1, 2, 3]), [1, 2, 3]).map((load) => load.shipments);
    const total = loads.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.max(...loads) <= (total / 3) * 1.35, `carga despareja: ${loads.join(", ")}`);
    assert.ok(loads.every((value) => value > 0));
  });

  it("treats a missing locality as its own group", () => {
    const stops = [stop("a", null), stop("b", "  "), stop("c", "Caaguazú")];
    const assignment = splitByLocality(stops, [1, 2]);
    assert.equal(assignment.a, assignment.b);
    assert.notEqual(assignment.a, assignment.c);
  });
});

describe("pedido a la API", () => {
  it("lists each courier's stop keys in sheet order", () => {
    const stops = [stop("a", null), stop("b", null), stop("c", null)];
    assert.deepEqual(toAssignments(stops, { a: 2, b: 1, c: 2 }, [1, 2]), [
      { courierId: 1, stopKeys: ["b"] },
      { courierId: 2, stopKeys: ["a", "c"] },
    ]);
  });
});
