import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMortgage } from "../src/lib/mortgage";

test("mortgage finances the listing price less the deposit and uses equal instalments", () => {
  const result = calculateMortgage(100000, 20, 30, 4.7)!;
  assert.equal(result.deposit, 20000);
  assert.equal(result.principal, 80000);
  assert.ok(Math.abs(result.monthly - 414.9103) < 0.01);
  // Independent monthly amortization confirms the balance is repaid.
  let balance = result.principal;
  for (let i = 0; i < 360; i++)
    balance = balance * (1 + 0.047 / 12) - result.monthly;
  assert.ok(Math.abs(balance) < 0.000001);
  assert.equal(result.total, result.monthly * 360);
  assert.equal(result.interest, result.total - 80000);
});
test("zero interest, full deposit, conversion and price changes remain consistent", () => {
  assert.equal(calculateMortgage(120000, 20, 20, 0)!.monthly, 400);
  assert.equal(calculateMortgage(120000, 100, 30, 4.7)!.monthly, 0);
  const euro = calculateMortgage(120000, 20, 30, 4.7)!;
  assert.ok(
    Math.abs(
      calculateMortgage(600000, 20, 30, 4.7)!.monthly - euro.monthly * 5,
    ) < 1e-8,
  );
  assert.equal(
    calculateMortgage(240000, 20, 30, 4.7)!.monthly,
    euro.monthly * 2,
  );
  assert.ok(calculateMortgage(120000, 20, 30, 0.00000001)!.monthly > 0);
});
test("invalid financial inputs never produce misleading estimates", () => {
  for (const args of [
    [0, 20, 30, 4.7],
    [NaN, 20, 30, 4.7],
    [100000, -1, 30, 4.7],
    [100000, 101, 30, 4.7],
    [100000, 20, 0, 4.7],
    [100000, 20, 30.5, 4.7],
    [100000, 20, 30, -1],
    [100000, 20, 30, Infinity],
  ]) {
    assert.equal(
      calculateMortgage(...(args as [number, number, number, number])),
      null,
    );
  }
});
