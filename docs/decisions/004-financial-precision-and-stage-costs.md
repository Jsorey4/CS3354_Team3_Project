# ADR 004: Money is exact decimal to the cent; the project total is the sum of stage costs only

- **Status:** Proposed. Needs Jon's and the team's sign-off (SE-NFR-01's "±1 for rounding" is ambiguous).
- **Owner:** Jon Sorey.
- **Traces:** SE-FR-01, SE-FR-02, SE-FR-03, SE-NFR-01, SE-NFR-02, UC-01.

## Context

SE-NFR-01 requires accurate financial and percentage calculations. The presentation adds "nearest cent, ±1 for rounding" and 0.01 % for percentages, without saying when rounding happens. Binary floating point cannot represent most cent amounts (0.1 + 0.2 = 0.30000000000000004), so a float anywhere in the path breaks "to the cent".

## Decision

1. **Storage:** every amount is `NUMERIC(12, 2)` in PostgreSQL and `Decimal` in Python (`Numeric(12, 2)` in SQLAlchemy). Range 0.00 to 9,999,999,999.99. Negative amounts, NaN and infinity are rejected.
2. **Rounding happens once, on input:** each amount is rounded to the cent with `ROUND_HALF_UP` (2.675 becomes 2.68, 1.005 becomes 1.01) before it is stored. Because every stored value is already whole cents, sums need no further rounding and are **exact**. The tolerance is therefore 0 cents, which satisfies any reading of "±1".
3. **Arithmetic:** sums are `Decimal` sums in Python or `SUM()` over `NUMERIC` in SQL. No amount is converted to `float` before it is added.
4. **Transport:** the API sends money as strings (`"1234.50"`), never JSON numbers. The browser adds and compares in whole cents with `BigInt` (`web/src/features/costs/model.ts`) and formats without converting to floating point.
5. **Exports:** spreadsheet cells are written as exact decimal numbers with the `0.00` format.
6. **Percentages:** computed in `Decimal`, rounded half-up to two decimals (1/3 is 33.33 %). A percentage with no denominator is shown as **N/A**, not 0.
7. **Hours** use the same two-decimal rule.

### What is added to what (UC-01)

| Figure | Rule |
| --- | --- |
| Project total | The sum of the **stage costs** the viewer may see. Labelled **Total** when every stage is included and **Subtotal** when only some are. |
| Bid | Shown on its own. Never added to anything. |
| Budget | Shown on its own. Never added to anything. |
| Expenses | Listed, filtered and totalled on their own ("expense total" for the rows shown). Never added to stage costs, bid or budget. |

There is no screen, report, export or widget that adds bid + budget + expenses, or expenses + stage costs.

One currency per project (`project_financials.currency`, three-letter code, default USD). No conversion is performed.

Members never receive financial data: the cost endpoints return 403 before any row is read, the database policies return zero rows, and financial sheets are dropped from a member's export (SE-NFR-02).

## How it is verified

- `test_uc01_cost_access_and_subtotal_math_…` and `test_se_nfr01_money_is_exact_decimal_with_half_up_rounding_uc01`: 0.10 + 0.20 = 0.30; one hundred 0.01 expenses = 1.00; 2.675 → 2.68; the largest amount stays exact; NaN / infinity / negatives are refused; totals are strings.
- `web/src/features/costs/model.test.ts`: the same sums in the browser.
- `test_uc15_every_string_cell_that_could_be_a_formula_is_prefixed_se_fr20`: exported amounts are numbers with two decimals.

## Open points for sign-off

- Accept "round half-up once at input, exact sums afterwards" as the meaning of SE-NFR-01.
- Confirm the Total / Subtotal rule and that bid, budget and expenses are never combined.
- Multi-currency projects are out of scope.
