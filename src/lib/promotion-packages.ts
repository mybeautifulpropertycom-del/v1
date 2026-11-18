export const promotionPackages = {
  start: {
    id: "start",
    name: "Start",
    price: 300,
    amount: 30000,
    description:
      "Un prim buget pentru căutările relevante din zona proprietății.",
  },
  plus: {
    id: "plus",
    name: "Plus",
    price: 500,
    amount: 50000,
    description:
      "Mai mult buget pentru testarea și ajustarea căutărilor relevante.",
  },
  extended: {
    id: "extended",
    name: "Extins",
    price: 1000,
    amount: 100000,
    description:
      "Un buget mai mare pentru promovarea proprietății în Google Search.",
  },
} as const;
export type PromotionPackage = keyof typeof promotionPackages;
export function isPromotionPackage(value: unknown): value is PromotionPackage {
  return typeof value === "string" && Object.hasOwn(promotionPackages, value);
}
export type PromotionPaymentStatus =
  "pending" | "paid" | "refunded" | "disputed" | "cancelled";
export type PromotionCampaignStatus =
  "queued" | "preparing" | "active" | "completed" | "stopped";
export const promotionStopLabels = {
  payment: "Plata necesită verificare",
  withdrawn: "Proprietatea a fost retrasă",
  deleted: "Proprietatea a fost ștearsă",
  sold: "Proprietatea a fost vândută",
  rented: "Proprietatea a fost închiriată",
  requested: "Oprire solicitată de agent",
} as const;
export type PromotionOrder = {
  id: string;
  owner_id: string | null;
  property_id: string | null;
  package: PromotionPackage;
  amount: number;
  currency: "ron";
  livemode: boolean;
  payment_status: PromotionPaymentStatus;
  campaign_status: PromotionCampaignStatus;
  target_area: string;
  notes: string;
  snapshot: {
    title: string;
    location: string;
    public_url: string;
    name: string;
    email: string;
    phone: string;
    keywords: string[];
  };
  created_at: string;
  paid_at: string | null;
  updated_at: string;
  spent_amount: number;
  impressions: number;
  clicks: number;
  report: string;
  campaign_id: string;
  stop_required: boolean;
  stop_reason: "" | keyof typeof promotionStopLabels;
  refunded_amount: number;
};
export const campaignLabels: Record<PromotionCampaignStatus, string> = {
  queued: "În așteptarea pregătirii",
  preparing: "În pregătire",
  active: "Campanie activă",
  completed: "Campanie încheiată",
  stopped: "Campanie oprită",
};
export const paymentLabels: Record<PromotionPaymentStatus, string> = {
  pending: "Plată în așteptare",
  paid: "Plată confirmată",
  refunded: "Plată rambursată",
  disputed: "Plată contestată",
  cancelled: "Plată anulată",
};
export function promotionKeywords(
  property: { type: string; transaction: string },
  area: string,
) {
  const type =
    (
      {
        House: "casă",
        Condo: "apartament",
        Penthouse: "penthouse",
        "Town House": "casă",
        Land: "teren",
      } as Record<string, string>
    )[property.type] || "proprietate";
  const transaction =
    property.transaction === "rent" ? "de închiriat" : "de vânzare";
  return [
    `${type} ${transaction} ${area}`,
    `${property.transaction === "rent" ? "închiriere" : "vânzare"} ${type} ${area}`,
  ];
}
