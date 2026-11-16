# Property mortgage simulator

All three public designs and their sample pages include the same interactive
calculator before the agent contact section. It receives the listing's current
price, currency and transaction type directly; no second price field, database
migration, external service or credentials are needed. Rentals and nonpositive or
missing prices do not display a calculator.

The heading “Planifică următorul pas.” stays unchanged. The listing photograph
illustrates the introduction. Controls sit on the left; a dark panel in each
page design's palette presents the monthly estimate, borrowed amount, a donut
showing principal versus interest over the whole term, and a declining-balance
chart. Fields have no decorative icons. On mobile, controls precede results.
Missing photographs fall back to the theme's background.

A repayment table below the results shows payment, principal, interest and
remaining balance for every month, in pages of six. Changes recalculate instantly
and reset the table to month one. The button scrolls to the plan, respecting
reduced-motion preferences. The table scrolls horizontally on small screens.
Totals remain permanently visible; only the longer assumptions are expandable.

The same annuity calculation drives the estimate, totals, amortization rows and
charts. The schedule calculates interest on the previous outstanding balance and
clears any floating-point residual in the last instalment. Table amounts are
rounded for display to two decimal places; the underlying calculation retains
full precision. This is an illustrative schedule, not a bank repayment offer.

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
listing price, adjustments, conversion, exclusion of rentals/missing prices,
pagination, invalid inputs, and chart/table updates. Schedule tests independently
reconcile principal and interest totals, monthly interest, and the final balance
at zero, standard and high rates and at zero/full deposits.
