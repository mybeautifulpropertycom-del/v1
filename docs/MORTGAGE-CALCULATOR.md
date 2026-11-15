# Property mortgage simulator

All three public designs and their sample pages include the same interactive
calculator before the agent contact section. It receives the listing's current
price, currency and transaction type directly; no second price field, database
migration, external service or credentials are needed. Rentals and nonpositive or
missing prices do not display a calculator.

The approved heading “Planifică următorul pas.” remains unchanged. A two-column
card pairs the listing's main photograph and monthly estimate on the left with
adjustments on the right. On mobile, the photo/estimate appears first. The image
loads lazily through the shared responsive PropertyImage component. Missing or
failed photographs fall back to a dark surface with readable light text. Repayment
totals expand through “Detaliile finanțării”; longer assumptions remain expandable.
The introduction and duplicate microcopy are omitted to keep the section visual.

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
