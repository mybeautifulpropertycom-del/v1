# Property mortgage simulator

All three public designs and their sample pages include the same interactive
calculator before the agent contact section. A horizontal price-to-instalment
summary leads into three adjustment fields; repayment totals and calculation
assumptions expand through “Vezi detaliile simulării”. It receives the listing's current
price, currency and transaction type directly; no second price field, database
migration, external service or credentials are needed. Rentals and nonpositive or
missing prices do not display a calculator.

Defaults: 20% deposit, 30 years, 4.7% nominal annual interest. These are editable
simulation assumptions, not lending criteria or bank offers. The amortization
formula uses equal monthly instalments with a constant interest rate, subtracting
the deposit from the full listing price. It handles zero interest and a 100%
deposit without division by zero. Total repayment excludes the deposit and fees;
the explanatory copy distinguishes nominal interest from APR/DAE and discloses
variable-rate, currency and additional-cost limitations.

The initial calculation uses the listing currency. EUR/USD listings also allow
RON simulations with an explicitly labelled manual exchange rate (initial
illustrations: 5 RON/EUR and 4.6 RON/USD). No live BNR or bank rate is claimed.
Visitor adjustments stay in component memory and never change the listing.

Validation: independent amortization-balance tests, zero-interest/full-deposit
edge cases, conversion and invalid input tests; browser tests cover all three
templates at desktop/mobile widths, saved-property pricing, changes to the
listing price, adjustments, conversion, and exclusion of rentals/missing prices.
