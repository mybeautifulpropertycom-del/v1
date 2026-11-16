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

test("repayment schedules reconcile each instalment, interest totals and a fully repaid balance", async () => {
  const { mortgageSchedule } = await import("../src/lib/mortgage");
  for (const rate of [0, 4.7, 15, 30])
    for (const deposit of [0, 20, 100]) {
      const loan = calculateMortgage(123456.78, deposit, 35, rate)!;
      const rows = mortgageSchedule(loan, rate);
      assert.equal(rows.length, 420);
      assert.equal(rows.at(-1)!.balance, 0);
      assert.ok(
        Math.abs(
          rows.reduce((sum, row) => sum + row.principal, 0) - loan.principal,
        ) < 0.0001,
      );
      assert.ok(
        Math.abs(
          rows.reduce((sum, row) => sum + row.interest, 0) - loan.interest,
        ) < 0.0001,
      );
      let balance = loan.principal;
      for (const row of rows) {
        assert.ok(Math.abs(row.interest - (balance * rate) / 1200) < 0.000001);
        assert.equal(row.payment, row.principal + row.interest);
        assert.ok(row.balance >= 0 && row.balance <= balance);
        balance = row.balance;
      }
    }
});
