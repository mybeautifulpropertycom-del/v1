// Equal monthly instalments, constant nominal annual interest, no fees.
export function calculateMortgage(
  price: number,
  depositPercent: number,
  years: number,
  annualRate: number,
) {
  if (
    ![price, depositPercent, years, annualRate].every(Number.isFinite) ||
    price <= 0 ||
    depositPercent < 0 ||
    depositPercent > 100 ||
    !Number.isInteger(years) ||
    years < 1 ||
    years > 40 ||
    annualRate < 0 ||
    annualRate > 30
  )
    return null;
  const deposit = (price * depositPercent) / 100;
  const principal = price - deposit;
  const months = years * 12;
  const monthlyRate = annualRate / 1200;
  const monthly =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate) /
        -Math.expm1(-months * Math.log1p(monthlyRate));
  const total = monthly * months;
  if (![monthly, total].every(Number.isFinite)) return null;
  return {
    deposit,
    principal,
    monthly,
    total,
    interest: Math.max(0, total - principal),
    months,
  };
}

export type MortgageInstalment = {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

export function mortgageSchedule(
  loan: NonNullable<ReturnType<typeof calculateMortgage>>,
  annualRate: number,
): MortgageInstalment[] {
  const rows: MortgageInstalment[] = [];
  let balance = loan.principal;
  for (let month = 1; month <= loan.months; month++) {
    const interest = (balance * annualRate) / 1200;
    const principal =
      month === loan.months
        ? balance
        : Math.min(balance, Math.max(0, loan.monthly - interest));
    balance = Math.max(0, balance - principal);
    rows.push({
      month,
      payment: principal + interest,
      principal,
      interest,
      balance,
    });
  }
  return rows;
}
