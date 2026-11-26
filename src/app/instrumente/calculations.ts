import { calculateMortgage } from "@/lib/mortgage";
import type { BuyerToolSlug } from "./buyer-tools";

type Field = {
  name: string;
  label: string;
  min: number;
  max: number;
  optional?: boolean;
  integer?: boolean;
};

const amountMax = 100_000_000;
const interest = {
  name: "interest",
  label: "Dobândă anuală nominală (%)",
  min: 0,
  max: 30,
};
const years = {
  name: "years",
  label: "Perioada creditului (ani)",
  min: 1,
  max: 40,
  integer: true,
};

export const fields: Record<BuyerToolSlug, Field[]> = {
  "calculator-credit-ipotecar": [
    { name: "price", label: "Prețul apartamentului", min: 1, max: amountMax },
    { name: "deposit", label: "Avans (%)", min: 0, max: 100 },
    interest,
    years,
  ],
  "pret-metru-patrat-apartament": [
    {
      name: "price",
      label: "Prețul primului apartament",
      min: 1,
      max: amountMax,
    },
    {
      name: "area",
      label: "Suprafața utilă a primului apartament (m²)",
      min: 0.01,
      max: 100_000,
    },
    {
      name: "secondPrice",
      label: "Prețul celui de-al doilea apartament",
      min: 1,
      max: amountMax,
      optional: true,
    },
    {
      name: "secondArea",
      label: "Suprafața utilă a celui de-al doilea apartament (m²)",
      min: 0.01,
      max: 100_000,
      optional: true,
    },
  ],
  "ce-apartament-imi-permit": [
    {
      name: "payment",
      label: "Rata lunară pe care o poți plăti",
      min: 0,
      max: amountMax,
    },
    {
      name: "savings",
      label: "Economiile disponibile",
      min: 0,
      max: amountMax,
    },
    {
      name: "reserve",
      label: "Cheltuieli inițiale și rezervă",
      min: 0,
      max: amountMax,
    },
    {
      name: "deposit",
      label: "Avans minim cerut de bancă (%)",
      min: 0,
      max: 100,
    },
    interest,
    years,
  ],
};

export function readToolNumber(text: string): number | null {
  const clean = text.trim().replace(/[\u00a0\u202f]/g, " ");
  if (/^\d+\.\d{1,2}$/.test(clean)) return Number(clean);
  if (!/^(?:\d+|\d{1,3}(?:[. ]\d{3})+)(?:,\d{1,2})?$/.test(clean)) return null;
  return Number(clean.replace(/[. ]/g, "").replace(",", "."));
}

type Row = { label: string; amount: number; unit?: string };
type Result = { rows: Row[] } | { error: string };
type Values = Record<string, number>;

function mortgage(values: Values): Result {
  const loan = calculateMortgage(
    values.price,
    values.deposit,
    values.years,
    values.interest,
  );
  if (!loan) return { error: "Verifică valorile pentru calculul ratei." };
  return {
    rows: [
      { label: "Rată lunară estimată", amount: loan.monthly, unit: "/ lună" },
      { label: "Sumă finanțată", amount: loan.principal },
      { label: "Avans în bani", amount: loan.deposit },
      { label: "Dobândă totală estimată", amount: loan.interest },
      { label: "Total estimat plătit băncii", amount: loan.total },
    ],
  };
}

function pricePerSquareMetre(values: Values): Result {
  const first = values.price / values.area;
  const hasSecondPrice = values.secondPrice !== undefined;
  const hasSecondArea = values.secondArea !== undefined;
  if (hasSecondPrice !== hasSecondArea)
    return {
      error:
        "Pentru a compara a doua ofertă, completează și prețul, și suprafața ei.",
    };
  if (!hasSecondPrice)
    return {
      rows: [{ label: "Preț pe metru pătrat", amount: first, unit: "/ m²" }],
    };
  const second = values.secondPrice / values.secondArea;
  return {
    rows: [
      { label: "Primul apartament", amount: first, unit: "/ m²" },
      { label: "Al doilea apartament", amount: second, unit: "/ m²" },
      {
        label: "Diferența de preț",
        amount: Math.abs(first - second),
        unit: "/ m²",
      },
    ],
  };
}

function affordablePrice(values: Values): Result {
  const unitLoan = calculateMortgage(1, 0, values.years, values.interest);
  if (!unitLoan) return { error: "Verifică dobânda și perioada creditului." };
  const ownFunds =
    Math.round(values.savings * 100) - Math.round(values.reserve * 100);
  if (ownFunds < 0)
    return {
      error:
        "Economiile disponibile sunt mai mici decât cheltuielile și rezerva trecute în calcul.",
    };
  const paymentLimit = Math.floor(
    Math.round(values.payment * 100) / unitLoan.monthly,
  );
  const depositPercent = Math.round(values.deposit * 100);
  const depositLimit =
    depositPercent === 0
      ? Infinity
      : Math.floor((ownFunds * 10_000) / depositPercent);
  const maxPrice = Math.min(ownFunds + paymentLimit, depositLimit);
  const ownContribution = Math.min(ownFunds, maxPrice);
  return {
    rows: [
      { label: "Preț maxim estimat", amount: maxPrice / 100 },
      { label: "Contribuție din economii", amount: ownContribution / 100 },
      {
        label: "Sumă estimată de finanțat",
        amount: (maxPrice - ownContribution) / 100,
      },
    ],
  };
}

export const calculate: Record<BuyerToolSlug, (values: Values) => Result> = {
  "calculator-credit-ipotecar": mortgage,
  "pret-metru-patrat-apartament": pricePerSquareMetre,
  "ce-apartament-imi-permit": affordablePrice,
};
